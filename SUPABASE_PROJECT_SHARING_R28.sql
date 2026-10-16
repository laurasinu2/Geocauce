-- GeoCauce R28 - migration for verified legacy Supabase schema (2026-10-16).
-- EXPECTS public.project(id_project uuid, owner_user_id uuid, deleted_at),
-- public.project_snapshots(id_project uuid), public.personas(id_persona, auth_user_id,
-- email, nombre), public.project_persona(id_project,id_persona,rol,deleted_at,revision),
-- and the public.rol_projecte enum (owner, editor, viewer).
--
-- Run only AFTER confirming a backup and testing on an isolated Supabase project.
-- This script NEVER deletes projects, snapshots, persons or files, and never changes
-- existing memberships. It does not create public.project_members.
-- The four RESTRICTIVE storage policies protect access even if old permissive
-- owner-of-file policies remain deployed.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.project') IS NULL
     OR to_regclass('public.project_snapshots') IS NULL
     OR to_regclass('public.personas') IS NULL
     OR to_regclass('public.project_persona') IS NULL
     OR to_regtype('public.rol_projecte') IS NULL THEN
    RAISE EXCEPTION 'GeoCauce legacy tables / rol_projecte are missing. Aborting migration.';
  END IF;
END
$guard$;

-- Retain existing legacy permissions, but normalize deletion and role checks.
CREATE OR REPLACE FUNCTION public.geocauce_is_project_owner(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project p
    WHERE p.id_project=p_project AND p.deleted_at IS NULL
      AND p.owner_user_id=(SELECT auth.uid())
  );
$fn$;

CREATE OR REPLACE FUNCTION public.geocauce_can_view_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.geocauce_is_project_owner(p_project)
    OR EXISTS (
      SELECT 1 FROM public.project_persona pp
      JOIN public.personas pe ON pe.id_persona=pp.id_persona
      JOIN public.project p ON p.id_project=pp.id_project
      WHERE pp.id_project=p_project AND p.deleted_at IS NULL
        AND pp.deleted_at IS NULL AND pp.rol IN ('owner','editor','viewer')
        AND pe.auth_user_id=(SELECT auth.uid())
    )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.geocauce_can_edit_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.geocauce_is_project_owner(p_project)
    OR EXISTS (
      SELECT 1 FROM public.project_persona pp
      JOIN public.personas pe ON pe.id_persona=pp.id_persona
      JOIN public.project p ON p.id_project=pp.id_project
      WHERE pp.id_project=p_project AND p.deleted_at IS NULL
        AND pp.deleted_at IS NULL AND pp.rol IN ('owner','editor')
        AND pe.auth_user_id=(SELECT auth.uid())
    )
  );
$fn$;

-- UI role resolution, never accepting a role sent by the browser as authority.
-- A project_persona 'owner' is treated as an editor; the owner_user_id alone
-- can share, revoke and delete a project.
CREATE OR REPLACE FUNCTION public.geocauce_project_role(p_project_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.project p
      WHERE p.id_project::text=p_project_id AND p.deleted_at IS NULL
        AND p.owner_user_id=(SELECT auth.uid())
    ) THEN 'owner'::text
    WHEN EXISTS (
      SELECT 1 FROM public.project p
      JOIN public.project_persona pp ON pp.id_project=p.id_project
      JOIN public.personas pe ON pe.id_persona=pp.id_persona
      WHERE p.id_project::text=p_project_id AND p.deleted_at IS NULL
        AND pp.deleted_at IS NULL AND pe.auth_user_id=(SELECT auth.uid())
        AND pp.rol IN ('owner','editor')
    ) THEN 'editor'::text
    WHEN EXISTS (
      SELECT 1 FROM public.project p
      JOIN public.project_persona pp ON pp.id_project=p.id_project
      JOIN public.personas pe ON pe.id_persona=pp.id_persona
      WHERE p.id_project::text=p_project_id AND p.deleted_at IS NULL
        AND pp.deleted_at IS NULL AND pe.auth_user_id=(SELECT auth.uid())
        AND pp.rol='viewer'
    ) THEN 'viewer'::text
    ELSE NULL
  END;
$fn$;

-- One RPC for catalog badges; still recheck the role on every project open/write.
CREATE OR REPLACE FUNCTION public.geocauce_my_project_roles()
RETURNS TABLE(project_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT p.id_project,
         CASE WHEN p.owner_user_id=(SELECT auth.uid()) THEN 'owner'::text
              WHEN pp.rol IN ('owner','editor') THEN 'editor'::text
              ELSE 'viewer'::text END
  FROM public.project p
  LEFT JOIN public.personas pe ON pe.auth_user_id=(SELECT auth.uid())
  LEFT JOIN public.project_persona pp
    ON pp.id_project=p.id_project AND pp.id_persona=pe.id_persona AND pp.deleted_at IS NULL
  WHERE (SELECT auth.uid()) IS NOT NULL AND p.deleted_at IS NULL
    AND (p.owner_user_id=(SELECT auth.uid()) OR pp.rol IN ('owner','editor','viewer'));
$fn$;

-- Existing users only. A new personas row is created for the recipient account
-- if and only if no bound profile already exists; never adopt an unbound profile
-- simply because its email matches.
CREATE OR REPLACE FUNCTION public.geocauce_set_project_member(
  p_project_id text, p_email text, p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_project uuid;
  v_target uuid;
  v_persona uuid;
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_project_id IS NULL OR p_project_id !~* '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'Invalid project ID' USING ERRCODE='22023';
  END IF;
  v_project := p_project_id::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.project p
    WHERE p.id_project=v_project AND p.deleted_at IS NULL AND p.owner_user_id=v_uid
  ) THEN RAISE EXCEPTION 'Only the owner can invite collaborators' USING ERRCODE='42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('viewer','editor') THEN
    RAISE EXCEPTION 'Choose viewer or editor' USING ERRCODE='22023';
  END IF;
  IF v_email IS NULL OR length(v_email)>254 OR position('@' IN v_email)<2 THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE='22023';
  END IF;
  SELECT au.id INTO v_target FROM auth.users au
  WHERE lower(au.email)=v_email LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'This email must register in GeoCauce before sharing' USING ERRCODE='22023';
  END IF;
  IF v_target=v_uid THEN
    RAISE EXCEPTION 'You are already the project owner' USING ERRCODE='22023';
  END IF;
  SELECT pe.id_persona INTO v_persona FROM public.personas pe
  WHERE pe.auth_user_id=v_target LIMIT 1;
  IF v_persona IS NULL THEN
    BEGIN
      INSERT INTO public.personas(auth_user_id,email,nombre)
      VALUES(v_target,v_email,split_part(v_email,'@',1))
      RETURNING id_persona INTO v_persona;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'The recipient account has a conflicting persona profile; contact an administrator' USING ERRCODE='23505';
    END;
  END IF;
  INSERT INTO public.project_persona AS pp (id_project,id_persona,rol)
  VALUES (v_project,v_persona,p_role::public.rol_projecte)
  ON CONFLICT (id_project,id_persona)
  DO UPDATE SET rol=EXCLUDED.rol, deleted_at=NULL,
                updated_at=now(), revision=pp.revision+1;
  RETURN v_target;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.geocauce_list_project_members(p_project_id text)
RETURNS TABLE(user_id uuid,email text,role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_project uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';
  END IF;
  v_project := p_project_id::uuid;
  IF NOT public.geocauce_is_project_owner(v_project) THEN
    RAISE EXCEPTION 'Only the owner can see collaborators' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT pe.auth_user_id,pe.email::text,pp.rol::text
  FROM public.project_persona pp
  JOIN public.personas pe ON pe.id_persona=pp.id_persona
  WHERE pp.id_project=v_project AND pp.deleted_at IS NULL
    AND pe.auth_user_id IS NOT NULL
  ORDER BY pe.email;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.geocauce_remove_project_member(
  p_project_id text,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_project uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';
  END IF;
  v_project := p_project_id::uuid;
  IF NOT public.geocauce_is_project_owner(v_project) THEN
    RAISE EXCEPTION 'Only the owner can revoke collaborators' USING ERRCODE='42501';
  END IF;
  UPDATE public.project_persona pp
  SET deleted_at=now(),updated_at=now(),revision=pp.revision+1
  FROM public.personas pe
  WHERE pp.id_project=v_project AND pp.id_persona=pe.id_persona
    AND pe.auth_user_id=p_user_id AND pp.deleted_at IS NULL;
END;
$fn$;

-- project_persona already has owner-only write RLS. Keep it intact.
-- Prevent changing the identity or soft-deleting the project as an editor.
CREATE OR REPLACE FUNCTION public.geocauce_guard_project_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$
BEGIN
  IF NEW.id_project IS DISTINCT FROM OLD.id_project
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'Cannot change project identity or owner' USING ERRCODE='42501';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND (SELECT auth.uid()) IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'Only the owner can archive or restore a project' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS geocauce_owner_guard ON public.project;
CREATE TRIGGER geocauce_owner_guard
  BEFORE UPDATE ON public.project FOR EACH ROW
  EXECUTE FUNCTION public.geocauce_guard_project_owner();

-- A previous permissive snapshot DELETE rule includes editors. Limit deletion
-- of a whole snapshot to the real owner, preserving editor INSERT/UPDATE.
DROP POLICY IF EXISTS geocauce_snapshot_owner_delete_gate ON public.project_snapshots;
CREATE POLICY geocauce_snapshot_owner_delete_gate ON public.project_snapshots
AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.geocauce_is_project_owner(id_project));

-- Protect project-owned private files even when a previous permissive
-- "owner of the uploaded file" policy exists. Revocation takes effect server-side.
-- RESTRICTIVE policies only narrow access and leave other buckets unaffected.

-- 24 legacy objects have no resolvable project record (15 with local IDs,
-- 9 referencing a removed/unknown cloud UUID). Keep the CURRENT UPLOADER'S
-- access only, never grant viewer/editor access based on a missing project.
-- Only the existing Storage owner_id may access orphaned legacy objects.
-- This preserves the previous geocauce_files_*_own policies and does NOT grant
-- new orphan uploads. Revoked members cannot use this fallback for live projects.

DROP POLICY IF EXISTS geocauce_assets_read_gate ON storage.objects;
CREATE POLICY geocauce_assets_read_gate ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
 bucket_id <> 'geocauce-files'
 OR public.geocauce_can_view_project(public.geocauce_storage_project_id(name))
 OR (
    (SELECT auth.uid()) IS NOT NULL
    AND owner_id=(SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.project p
      WHERE p.id_project=public.geocauce_storage_project_id(name)
    )
 )
);

DROP POLICY IF EXISTS geocauce_assets_insert_gate ON storage.objects;
CREATE POLICY geocauce_assets_insert_gate ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'geocauce-files'
  OR public.geocauce_can_edit_project(public.geocauce_storage_project_id(name))
);

DROP POLICY IF EXISTS geocauce_assets_update_gate ON storage.objects;
CREATE POLICY geocauce_assets_update_gate ON storage.objects
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  bucket_id <> 'geocauce-files'
  OR public.geocauce_can_edit_project(public.geocauce_storage_project_id(name))
  OR (
    (SELECT auth.uid()) IS NOT NULL
    AND owner_id=(SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.project p
      WHERE p.id_project=public.geocauce_storage_project_id(name)
    )
  )
)
WITH CHECK (
  bucket_id <> 'geocauce-files'
  OR public.geocauce_can_edit_project(public.geocauce_storage_project_id(name))
  OR (
    (SELECT auth.uid()) IS NOT NULL
    AND owner_id=(SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.project p
      WHERE p.id_project=public.geocauce_storage_project_id(name)
    )
  )
);

DROP POLICY IF EXISTS geocauce_assets_delete_gate ON storage.objects;
CREATE POLICY geocauce_assets_delete_gate ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  bucket_id <> 'geocauce-files'
  OR public.geocauce_can_edit_project(public.geocauce_storage_project_id(name))
  OR (
    (SELECT auth.uid()) IS NOT NULL
    AND owner_id=(SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.project p
      WHERE p.id_project=public.geocauce_storage_project_id(name)
    )
  )
);

-- PostgREST exposes only explicit RPC endpoints to authenticated users.
REVOKE ALL ON FUNCTION public.geocauce_project_role(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.geocauce_my_project_roles() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.geocauce_set_project_member(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.geocauce_list_project_members(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.geocauce_remove_project_member(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.geocauce_project_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_my_project_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_set_project_member(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_list_project_members(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_remove_project_member(text,uuid) TO authenticated;

COMMIT;

-- Request PostgREST to discover the new RPC signatures immediately.
NOTIFY pgrst, 'reload schema';
