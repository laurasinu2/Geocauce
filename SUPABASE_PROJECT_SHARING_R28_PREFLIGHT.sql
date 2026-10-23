-- GeoCauce R28 / comprobación ANTES de la migración. SOLO LECTURA.
-- Ejecutar en el SQL Editor del proyecto Supabase al que apunta GeoCauce.
-- Si rutas_sin_proyecto > 0 o rutas_sin_registro > 0, DETENTE y envía el resultado.
SELECT
  COUNT(*) AS archivos_totales,
  COUNT(*) FILTER (
    WHERE public.geocauce_storage_project_id(o.name) IS NULL
  ) AS rutas_sin_proyecto,
  COUNT(*) FILTER (
    WHERE public.geocauce_storage_project_id(o.name) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.project p
        WHERE p.id_project = public.geocauce_storage_project_id(o.name)
      )
  ) AS rutas_sin_registro
FROM storage.objects o
WHERE o.bucket_id = 'geocauce-files';

-- Comprobar que los proyectos activos mantienen un propietario.
SELECT
  COUNT(*) AS proyectos_activos,
  COUNT(*) FILTER (WHERE owner_user_id IS NULL) AS sin_propietario
FROM public.project
WHERE deleted_at IS NULL;

-- Seguridad actual, resumida, sin mostrar correos ni contenido de proyectos.
SELECT schemaname,tablename,policyname,cmd,permissive
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('project','project_snapshots','personas','project_persona'))
   OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'geocauce_%')
ORDER BY schemaname,tablename,policyname;
