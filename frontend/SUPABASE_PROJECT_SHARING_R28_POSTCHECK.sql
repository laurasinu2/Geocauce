-- GeoCauce R28 / comprobación DESPUÉS de ejecutar la migración. SOLO LECTURA.
-- Esperado: 5 funciones RPC, 4 policies de Storage y 1 de snapshots.
SELECT p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
   'geocauce_project_role',
   'geocauce_my_project_roles',
   'geocauce_set_project_member',
   'geocauce_list_project_members',
   'geocauce_remove_project_member'
  )
ORDER BY p.proname;

SELECT schemaname,tablename,policyname,cmd,permissive
FROM pg_policies
WHERE (schemaname='storage' AND tablename='objects'
         AND policyname IN (
          'geocauce_assets_read_gate',
          'geocauce_assets_insert_gate',
          'geocauce_assets_update_gate',
          'geocauce_assets_delete_gate'
         ))
   OR (schemaname='public' AND tablename='project_snapshots'
         AND policyname='geocauce_snapshot_owner_delete_gate')
ORDER BY schemaname,tablename,policyname;

-- The SQL editor usually runs without a user's JWT; auth.uid() is NULL there.
-- To test owner/editor/viewer, sign into GeoCauce with actual test accounts.
