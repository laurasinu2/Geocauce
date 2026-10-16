-- GeoCauce: collaboration migration for existing databases. Run in Supabase SQL Editor
-- ONLY after making a Supabase backup. Do not run SUPABASE_SETUP.sql on legacy databases.
-- Supports modern public.projects(id text) AND legacy public.project(id_project uuid).
-- Every security decision is enforced inside Postgres (RLS), not in the URL or browser.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer','editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON public.project_members(user_id);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_members FROM anon, authenticated;
GRANT SELECT ON public.project_members TO authenticated;

CREATE OR REPLACE FUNCTION public.geocauce_project_owner(p_project_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_owner uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_project_id IS NULL THEN RETURN NULL; END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE 'SELECT owner_id FROM public.projects WHERE id = $1 LIMIT 1'
      INTO v_owner USING p_project_id;
  ELSIF to_regclass('public.project') IS NOT NULL THEN
    EXECUTE 'SELECT owner_user_id FROM public.project WHERE id_project::text = $1 LIMIT 1'
      INTO v_owner USING p_project_id;
  END IF;
  RETURN v_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.geocauce_project_role(p_project_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_role text;
BEGIN
  IF v_uid IS NULL OR p_project_id IS NULL THEN RETURN NULL; END IF;
  IF public.geocauce_project_owner(p_project_id) = v_uid THEN RETURN 'owner'; END IF;
  SELECT m.role INTO v_role FROM public.project_members AS m
   WHERE m.project_id = p_project_id AND m.user_id = v_uid;
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.geocauce_project_owner(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.geocauce_project_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geocauce_project_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_project_owner(text) TO authenticated;

DROP POLICY IF EXISTS geocauce_members_read ON public.project_members;
CREATE POLICY geocauce_members_read ON public.project_members
 FOR SELECT TO authenticated USING (
   user_id = (SELECT auth.uid())
   OR public.geocauce_project_role(project_id) = 'owner'
 );

-- Invite existing account holders only; never accept user_id or project role from client as authority.
CREATE OR REPLACE FUNCTION public.geocauce_set_project_member(
 p_project_id text, p_email text, p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user uuid; v_email text := lower(btrim(p_email));
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF public.geocauce_project_role(p_project_id) <> 'owner' THEN
   RAISE EXCEPTION 'Only the project owner can share' USING ERRCODE='42501';
 END IF;
 IF p_role IS NULL OR p_role NOT IN ('viewer','editor') THEN
   RAISE EXCEPTION 'Invalid collaboration role' USING ERRCODE='22023';
 END IF;
 IF v_email IS NULL OR length(v_email) < 3 THEN
   RAISE EXCEPTION 'Valid account email required' USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
 IF v_user IS NULL THEN RAISE EXCEPTION 'This user must create an account first' USING ERRCODE='22023'; END IF;
 IF v_user = (SELECT auth.uid()) THEN RAISE EXCEPTION 'Owner role cannot be changed' USING ERRCODE='22023'; END IF;
 INSERT INTO public.project_members(project_id,user_id,role) VALUES (p_project_id,v_user,p_role)
 ON CONFLICT(project_id,user_id) DO UPDATE SET role = EXCLUDED.role;
 RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.geocauce_remove_project_member(
 p_project_id text, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF public.geocauce_project_role(p_project_id) <> 'owner' THEN
  RAISE EXCEPTION 'Only the project owner can revoke access' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.project_members WHERE project_id=p_project_id AND user_id=p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.geocauce_list_project_members(p_project_id text)
RETURNS TABLE(user_id uuid, email text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF public.geocauce_project_role(p_project_id) <> 'owner' THEN
   RAISE EXCEPTION 'Only the project owner can list collaborators' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT m.user_id, u.email::text, m.role
 FROM public.project_members m JOIN auth.users u ON u.id=m.user_id
 WHERE m.project_id=p_project_id ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.geocauce_set_project_member(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.geocauce_remove_project_member(text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.geocauce_list_project_members(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geocauce_set_project_member(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_remove_project_member(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geocauce_list_project_members(text) TO authenticated;

-- Forbid owner reassignment through PATCH /projects (or legacy /project).
CREATE OR REPLACE FUNCTION public.geocauce_guard_project_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$
BEGIN
 IF TG_TABLE_NAME='projects' THEN
   IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id THEN
     RAISE EXCEPTION 'Project identity is immutable';
   END IF;
 ELSE
   IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.id_project IS DISTINCT FROM OLD.id_project THEN
     RAISE EXCEPTION 'Project identity is immutable';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;

DO $$
BEGIN
 IF to_regclass('public.projects') IS NOT NULL THEN
   EXECUTE 'DROP TRIGGER IF EXISTS geocauce_owner_guard ON public.projects';
   EXECUTE 'CREATE TRIGGER geocauce_owner_guard BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.geocauce_guard_project_owner()';
   EXECUTE 'DROP POLICY IF EXISTS projects_select_own ON public.projects';
   EXECUTE 'DROP POLICY IF EXISTS projects_update_own ON public.projects';
   EXECUTE 'DROP POLICY IF EXISTS projects_delete_own ON public.projects';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_read ON public.projects';
   EXECUTE 'CREATE POLICY geocauce_project_read ON public.projects FOR SELECT TO authenticated USING (public.geocauce_project_role(id) IN (''owner'',''editor'',''viewer''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_write ON public.projects';
   EXECUTE 'CREATE POLICY geocauce_project_write ON public.projects FOR UPDATE TO authenticated USING (public.geocauce_project_role(id) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_delete ON public.projects';
   EXECUTE 'CREATE POLICY geocauce_project_delete ON public.projects FOR DELETE TO authenticated USING (public.geocauce_project_role(id) = ''owner'')';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_write_gate ON public.projects';
   EXECUTE 'CREATE POLICY geocauce_project_write_gate ON public.projects AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.geocauce_project_role(id) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_delete_gate ON public.projects';
   EXECUTE 'CREATE POLICY geocauce_project_delete_gate ON public.projects AS RESTRICTIVE FOR DELETE TO authenticated USING (public.geocauce_project_role(id) = ''owner'')';
   EXECUTE 'DROP POLICY IF EXISTS snapshots_select_own ON public.project_snapshots';
   EXECUTE 'DROP POLICY IF EXISTS snapshots_insert_own ON public.project_snapshots';
   EXECUTE 'DROP POLICY IF EXISTS snapshots_update_own ON public.project_snapshots';
   EXECUTE 'DROP POLICY IF EXISTS snapshots_delete_own ON public.project_snapshots';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_read ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_read ON public.project_snapshots FOR SELECT TO authenticated USING (public.geocauce_project_role(project_id) IN (''owner'',''editor'',''viewer''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_insert ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_insert ON public.project_snapshots FOR INSERT TO authenticated WITH CHECK (public.geocauce_project_role(project_id) IN (''owner'',''editor'') AND owner_id = public.geocauce_project_owner(project_id))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_update ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_update ON public.project_snapshots FOR UPDATE TO authenticated USING (public.geocauce_project_role(project_id) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(project_id) IN (''owner'',''editor'') AND owner_id = public.geocauce_project_owner(project_id))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_delete ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_delete ON public.project_snapshots FOR DELETE TO authenticated USING (public.geocauce_project_role(project_id) = ''owner'')';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_write_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_write_gate ON public.project_snapshots AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.geocauce_project_role(project_id) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(project_id) IN (''owner'',''editor'') AND owner_id = public.geocauce_project_owner(project_id))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_insert_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_insert_gate ON public.project_snapshots AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.geocauce_project_role(project_id) IN (''owner'',''editor'') AND owner_id = public.geocauce_project_owner(project_id))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_delete_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_delete_gate ON public.project_snapshots AS RESTRICTIVE FOR DELETE TO authenticated USING (public.geocauce_project_role(project_id) = ''owner'')';
 ELSIF to_regclass('public.project') IS NOT NULL THEN
   EXECUTE 'DROP TRIGGER IF EXISTS geocauce_owner_guard ON public.project';
   EXECUTE 'CREATE TRIGGER geocauce_owner_guard BEFORE UPDATE ON public.project FOR EACH ROW EXECUTE FUNCTION public.geocauce_guard_project_owner()';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_read ON public.project';
   EXECUTE 'CREATE POLICY geocauce_project_read ON public.project FOR SELECT TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'',''viewer''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_write ON public.project';
   EXECUTE 'CREATE POLICY geocauce_project_write ON public.project FOR UPDATE TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_write_gate ON public.project';
   EXECUTE 'CREATE POLICY geocauce_project_write_gate ON public.project AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_project_delete_gate ON public.project';
   EXECUTE 'CREATE POLICY geocauce_project_delete_gate ON public.project AS RESTRICTIVE FOR DELETE TO authenticated USING (public.geocauce_project_role(id_project::text) = ''owner'')';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_read ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_read ON public.project_snapshots FOR SELECT TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'',''viewer''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_insert ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_insert ON public.project_snapshots FOR INSERT TO authenticated WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_update ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_update ON public.project_snapshots FOR UPDATE TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_insert_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_insert_gate ON public.project_snapshots AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_write_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_write_gate ON public.project_snapshots AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.geocauce_project_role(id_project::text) IN (''owner'',''editor'')) WITH CHECK (public.geocauce_project_role(id_project::text) IN (''owner'',''editor''))';
   EXECUTE 'DROP POLICY IF EXISTS geocauce_snapshot_delete_gate ON public.project_snapshots';
   EXECUTE 'CREATE POLICY geocauce_snapshot_delete_gate ON public.project_snapshots AS RESTRICTIVE FOR DELETE TO authenticated USING (public.geocauce_project_role(id_project::text) = ''owner'')';
 ELSE
   RAISE EXCEPTION 'No GeoCauce project table found';
 END IF;
END;
$$;

-- Existing storage policies grant owner-only access; add project members to private
-- bucket, with restrictive write checks so legacy owner-only policies cannot bypass them.
DROP POLICY IF EXISTS geocauce_shared_assets_read ON storage.objects;
CREATE POLICY geocauce_shared_assets_read ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='geocauce-files'
  AND public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor','viewer')
  AND split_part(name,'/',1) = public.geocauce_project_owner(split_part(name,'/',2))::text
 );
DROP POLICY IF EXISTS geocauce_shared_assets_insert ON storage.objects;
CREATE POLICY geocauce_shared_assets_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
  bucket_id='geocauce-files'
  AND public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
  AND split_part(name,'/',1) = public.geocauce_project_owner(split_part(name,'/',2))::text
 );
DROP POLICY IF EXISTS geocauce_shared_assets_update ON storage.objects;
CREATE POLICY geocauce_shared_assets_update ON storage.objects
 FOR UPDATE TO authenticated USING (
  bucket_id='geocauce-files'
  AND public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
 ) WITH CHECK (
  bucket_id='geocauce-files'
  AND public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
  AND split_part(name,'/',1) = public.geocauce_project_owner(split_part(name,'/',2))::text
 );
DROP POLICY IF EXISTS geocauce_shared_assets_delete ON storage.objects;
CREATE POLICY geocauce_shared_assets_delete ON storage.objects
 FOR DELETE TO authenticated USING (
  bucket_id='geocauce-files'
  AND public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
 );
DROP POLICY IF EXISTS geocauce_assets_insert_gate ON storage.objects;
CREATE POLICY geocauce_assets_insert_gate ON storage.objects AS RESTRICTIVE
 FOR INSERT TO authenticated WITH CHECK (
   bucket_id<>'geocauce-files' OR
   (public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
    AND split_part(name,'/',1) = public.geocauce_project_owner(split_part(name,'/',2))::text)
 );
DROP POLICY IF EXISTS geocauce_assets_update_gate ON storage.objects;
CREATE POLICY geocauce_assets_update_gate ON storage.objects AS RESTRICTIVE
 FOR UPDATE TO authenticated USING (
   bucket_id<>'geocauce-files' OR public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
 ) WITH CHECK (
   bucket_id<>'geocauce-files' OR
   (public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
    AND split_part(name,'/',1) = public.geocauce_project_owner(split_part(name,'/',2))::text)
 );
DROP POLICY IF EXISTS geocauce_assets_delete_gate ON storage.objects;
CREATE POLICY geocauce_assets_delete_gate ON storage.objects AS RESTRICTIVE
 FOR DELETE TO authenticated USING (
   bucket_id<>'geocauce-files' OR public.geocauce_project_role(split_part(name,'/',2)) IN ('owner','editor')
 );

COMMIT;
