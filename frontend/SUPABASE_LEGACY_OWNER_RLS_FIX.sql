-- GeoCauce · Refuerzo seguro de permisos del propietario en el esquema clásico
-- Para bases con public.project(id_project, owner_user_id) y
-- public.project_snapshots(id_project, state).
-- No modifica datos, no elimina tablas ni desactiva RLS.
-- Preserva las políticas actuales para personas colaboradoras.
-- Repetible: solo sustituye las políticas cuyo nombre empieza por
-- geocauce_owner_fallback_20261013_.

BEGIN;

-- El INSERT de project ya usa owner_user_id = auth.uid().
-- Se añade SELECT y UPDATE por propietario, necesarios para ON CONFLICT.
DROP POLICY IF EXISTS geocauce_owner_fallback_20261013_select ON public.project;
CREATE POLICY geocauce_owner_fallback_20261013_select
ON public.project AS PERMISSIVE FOR SELECT TO authenticated
USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS geocauce_owner_fallback_20261013_update ON public.project;
CREATE POLICY geocauce_owner_fallback_20261013_update
ON public.project AS PERMISSIVE FOR UPDATE TO authenticated
USING (owner_user_id = (select auth.uid()))
WITH CHECK (owner_user_id = (select auth.uid()));

-- El propietario del proyecto también puede guardar y recuperar el snapshot.
-- La subconsulta utiliza el id_project del snapshot, no del proyecto interior.
DROP POLICY IF EXISTS geocauce_owner_fallback_20261013_snapshot_select ON public.project_snapshots;
CREATE POLICY geocauce_owner_fallback_20261013_snapshot_select
ON public.project_snapshots AS PERMISSIVE FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project AS p
    WHERE p.id_project = project_snapshots.id_project
      AND p.owner_user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS geocauce_owner_fallback_20261013_snapshot_insert ON public.project_snapshots;
CREATE POLICY geocauce_owner_fallback_20261013_snapshot_insert
ON public.project_snapshots AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project AS p
    WHERE p.id_project = project_snapshots.id_project
      AND p.owner_user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS geocauce_owner_fallback_20261013_snapshot_update ON public.project_snapshots;
CREATE POLICY geocauce_owner_fallback_20261013_snapshot_update
ON public.project_snapshots AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project AS p
    WHERE p.id_project = project_snapshots.id_project
      AND p.owner_user_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project AS p
    WHERE p.id_project = project_snapshots.id_project
      AND p.owner_user_id = (select auth.uid())
  )
);

COMMIT;
