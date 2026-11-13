# Solución de permisos RLS del esquema clásico de GeoCauce

Esta corrección está diseñada para **la base clásica** vista en las capturas:
`public.project` con `id_project` y `owner_user_id`, y
`public.project_snapshots` con `id_project`.

## Qué se observó

La tabla `project` tiene una política `project_insert` que permite insertar
filas si `owner_user_id = auth.uid()`. Sin embargo, `project_update` verifica
`geocauce_can_edit_project(id_project)`. Las políticas de snapshots también
dependen de esa función.

Esto **no prueba** cuál es la función que falla, pero si la cuenta es
propietaria y la función no la reconoce, el UPSERT puede ser denegado.

## Pasos

1. Exporta una copia `.geocauce` de cualquier proyecto local importante.
2. No ejecutes `SUPABASE_SETUP.sql` sobre la base clásica.
3. Abre `SUPABASE_LEGACY_OWNER_RLS_FIX.sql` en Supabase > SQL Editor,
   lee el contenido y ejecútalo en **el proyecto Supabase correcto**.
4. Actualiza la PWA a nube r7 y pulsa **Sincronizar ahora**.
5. Si vuelve a fallar, copia el mensaje exacto. No borres el proyecto, las
   tablas ni las cuentas.

El script crea permisos adicionales **solo cuando
`owner_user_id = auth.uid()`** y los extiende a snapshots vinculados.
Conserva las políticas originales, incluido el acceso de posibles colaboradores.
No desactiva RLS, no mueve ni borra datos y es repetible.
Si el proyecto antiguo pertenece a otra cuenta, seguirá bloqueado,
que es el comportamiento correcto.
