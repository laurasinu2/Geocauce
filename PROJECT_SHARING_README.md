# Compartición de proyectos y autorización (rama r28)

Esta rama **no migra la base de datos automáticamente**. El front utiliza funciones RPC nuevas; en producción no se debe habilitar esta rama hasta ejecutar y auditar la migración.

## Instalación segura

1. Crear copia de seguridad de Supabase (esquema y datos) y exportar copias `.geocauce` de los proyectos importantes.
2. Revisar la estructura REAL de la base Supabase activa (esquema clásico `project` o moderno `projects`) y sus políticas RLS, incluidas las de Storage y colaboraciones anteriores.
3. Ejecutar **solo** `SUPABASE_PROJECT_SHARING_R28.sql` en SQL Editor, con una cuenta administradora autorizada. No ejecutar `SUPABASE_SETUP.sql` encima de una instalación antigua.
4. Verificar permisos con tres cuentas reales (owner, editor y viewer), incluyendo acceso directo a REST y Storage. Ninguna restricción del frontend sustituye RLS.
5. Publicar la nueva versión en un entorno de pruebas y validar recuperación offline, subida de datos, fotos, TIFF y SHP antes de fusionar.

## Roles

- **Owner**: visualización, edición, gestión de invitaciones y borrado.
- **Editor**: visualización, edición de snapshots y archivos, sin gestión de colaboradores.
- **Viewer**: consultas y descargas, sin escrituras remotas.

La API recibe el JWT con `Authorization: Bearer` y Supabase valida la sesión. La función `geocauce_project_role(projectId)` lee el usuario autenticado con `auth.uid()` y resuelve la pertenencia actual desde PostgreSQL; nunca acepta un rol aportado por el navegador. Las políticas RLS protegen las tablas y `storage.objects`, incluso si se altera una URL o se manipula JavaScript.

Para compartir, debe existir una cuenta registrada con el correo invitado; el propietario invoca RPC `geocauce_set_project_member`, `geocauce_list_project_members` y `geocauce_remove_project_member`. El enlace solo señala el proyecto: no concede permisos por sí mismo.

## URLs

GitHub Pages no hace fallback de rutas anidadas a `index.html`, por lo que esta rama utiliza rutas por query:

- `/?project=<project-uuid>` vista de lectura.
- `/?project=<project-uuid>&mode=edit` petición de edición, concedida únicamente a roles owner/editor.
- `/` panel.

Las rutas se guardan en historial y se interpretan al abrir el enlace. No uses un proyecto local (`P...`) como vínculo para colaborar: se utiliza el UUID cloud.

## Límites y precauciones

- **Operaciones offline:** las comprobaciones locales funcionan con el último permiso conocido para permitir seguir trabajando sin conexión. La revocación empieza a aplicarse en el servidor de inmediato; un dispositivo sin conexión podría conservar una copia local hasta volver a conectarse.
- La descarga inicial de un proyecto compartido utiliza la restauración existente. La sincronización incremental preexistente aún no descargaba automáticamente todos los formatos de assets entre dispositivos; es una tarea separada que conviene validar y mejorar antes de uso colaborativo intensivo.
- Compartir acceso no da un permiso para distribuir copias descargadas fuera de GeoCauce. Las revocaciones no pueden borrar archivos ya exportados.
- El schema SQL incluye políticas restrictivas para limitar accesos en instalaciones que conserven políticas anteriores. **Auditar políticas personalizadas** antes de aplicar la migración.
- Los datos históricos de un mismo proyecto en diferentes dispositivos pueden entrar en conflicto. Antes de abrir un proyecto compartido desde una segunda tablet, realizar copia y verificar sincronización.

## Pruebas de acceso imprescindibles

1. Sin token: REST/RPC y Storage protegidos rechazan la petición.
2. JWT caducado o manipulado: Supabase rechaza la petición.
3. Viewer: puede leer el proyecto y descargar assets; PATCH/POST/DELETE fallan.
4. Editor: puede escribir datos y assets, pero no cambiar propietario ni asignar colaboradores.
5. Owner: puede añadir, cambiar y revocar un miembro.
6. Revocado: un token existente ya no permite leer ni editar el proyecto.
7. Edición concurrente y modo offline: cambios reconciliados y sin pérdidas.

Las pruebas `npm test` de esta rama comprueban rutas, controles y las garantías expresadas por el código, pero **no sustituyen** pruebas de integración con un Supabase de ensayo.
