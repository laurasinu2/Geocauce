-- GeoCauce: políticas RLS de la base clásica. SOLO LECTURA.
-- Copia y ejecuta en Supabase > SQL Editor; envía una captura del resultado.
-- NO modifica ni borra tablas, proyectos, usuarios ni políticas.
select
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname='public'
  and tablename in ('project','projects','project_snapshots')
order by tablename, policyname;
