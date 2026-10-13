# Supabase · GeoCauce

## Antes de cambiar la base de datos

Hay **dos esquemas históricos**. La PWA nube r7 admite ambos sin borrar registros.

**Clásico**: `public.project` (singular, `id_project` UUID, `owner_user_id` UUID), `public.project_snapshots` (con `id_project`, `schema_version`, `state`).

**Moderno**: `public.projects` (plural, `id`, `owner_id`) y `public.project_snapshots` (con `project_id`, `owner_id`, `palette`).

Si tienes el esquema clásico, **NO ejecutes `SUPABASE_SETUP.sql`**: la tabla `project_snapshots` antigua ya existe y el script moderno no adapta sus columnas. Para detectar las políticas existentes, ejecuta `SUPABASE_LEGACY_DIAGNOSTIC.sql` (solo lectura).

El error `new row violates row-level security policy for table "project"` significa que Supabase rechaza un INSERT o UPSERT según las políticas RLS vigentes. Comprueba que el usuario autenticado coincide con `owner_user_id`, que tiene permisos en SELECT/INSERT/UPDATE y que los snapshots solo son accesibles a través de proyectos propios. No desactives RLS; pide revisar las políticas antes de cambiarlas.

## Instalación nueva desde cero

Solo para una base sin tablas previas: ejecuta `SUPABASE_SETUP.sql`, crea cuenta y configura `supabase-config.js` con URL y clave pública. Nunca pongas `service_role` en código cliente.

## Seguridad de los datos locales

Antes de reinstalar o borrar almacenamiento, exporta una copia completa `.geocauce`. La aplicación guarda primero en local. El botón de actualizar PWA solo cambia archivos, no elimina proyectos.
