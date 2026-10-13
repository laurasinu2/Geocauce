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

## Sincronización incremental (PWA nube r13)

- **Subir cambios** guarda el mismo proyecto remoto, identificándolo mediante `cloudProjectId`. Los archivos se comprueban contra el manifiesto cloud: si no cambian, se reutilizan sin volver a subirlos. Los datos estructurados se guardan en el snapshot existente. Sin cambios no se actualiza la versión remota.
- **Descargar cambios** verifica la huella de los archivos presentes en la base local y descarga solo los ausentes o distintos. Los elementos eliminados del snapshot remoto se eliminan también de la vista local durante la restauración. La versión local anterior sigue recuperable.
- Los blobs tienen rutas inmutables para evitar una subida parcialmente visible. Después del commit se pueden borrar versiones obsoletas **solo si ningún otro snapshot de la cuenta las referencia**. Si falla la limpieza, la subida sigue siendo válida y se reintentará más tarde.
- Si dos dispositivos han cambiado un proyecto, GeoCauce **no mezcla automáticamente ediciones incompatibles**, ni crea otro proyecto: pide descargar la versión remota o confirmar expresamente que se quiere sustituir. Antes de una descarga crea una recuperación local. Conviene guardar una exportación `.geocauce` antes de resolver un conflicto.
- Nunca ejecutar scripts de inicialización de Supabase en una instalación antigua sin verificar primero su esquema. Esta actualización de la PWA no requiere modificar tablas existentes.
- Ejecutar `npm test` para comprobar el comportamiento de caché, HTTP 400, reutilización de datos y limpieza segura. Probar posteriormente con dos dispositivos y una cuenta de prueba antes de publicar en producción.
