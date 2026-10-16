# GeoCauce · Compartir proyectos sobre el esquema real de Supabase (r28)

Este documento utiliza la estructura **verificada por consultas de solo lectura** en Supabase el 16-10-2026:

- `public.project(id_project uuid, owner_user_id uuid, deleted_at)`
- `public.project_snapshots(id_project uuid, state jsonb)`
- `public.personas(id_persona uuid, auth_user_id uuid UNIQUE, email UNIQUE, nombre NOT NULL)`
- `public.project_persona(id_project uuid, id_persona uuid, rol public.rol_projecte, deleted_at, revision)`
- `public.rol_projecte`: `owner`, `editor`, `viewer`
- Bucket privado `geocauce-files`; 90 objetos en el inventario del usuario
- Funciones y políticas existentes: `geocauce_can_view_project`, `geocauce_can_edit_project`,
  `geocauce_is_project_owner`, `geocauce_storage_project_id`.

**NO ejecutar `SUPABASE_SETUP.sql` ni el SQL genérico de ramas anteriores.** No crear `public.project_members`: duplicaría la autorización.

## Seguridad y orden de despliegue

1. Exportar copias completas de los proyectos locales de GeoCauce.
2. Respaldar esquema y datos de PostgreSQL y los binarios del bucket `geocauce-files`. Un volcado de Postgres **no** contiene los bytes de Storage.
3. Crear entorno de pruebas independiente en Supabase. No cambiar aún el `supabase-config.js` de `main` ni la PWA de producción.
4. Revisar y ejecutar **en el entorno de pruebas** `SUPABASE_PROJECT_SHARING_R28.sql` desde SQL Editor.
5. Comprobar que las funciones RPC se crean, que las políticas restrictivas están presentes y que los proyectos originales siguen siendo legibles.
6. Desplegar **la rama** en una URL de pruebas que tenga `supabase-config.js` apuntando a la instancia de prueba.
7. Usar tres usuarios de prueba: owner, editor y viewer. Crear cuentas mediante el flujo normal de Auth.
8. El owner crea y sincroniza un proyecto de prueba. Desde el botón Compartir invita un correo existente como viewer y otro como editor.
9. Comprobar VIEW, EDIT, copias y cambios de rol directamente en REST y Storage (además de la interfaz). El editor no debe poder gestionar miembros; el viewer no puede escribir; un revocado no puede leer ni escribir aunque mantenga el JWT anterior.
10. Probar en dos dispositivos, con fotografías, GeoTIFF, SHP, fichas y ediciones offline. El código actual aún tiene una limitación en la recepción incremental de archivos no fotográficos: no dar por lista la colaboración para producción hasta que esto esté solucionado.
11. Solo cuando pasen pruebas, respaldo y plan de vuelta atrás, aplicar la migración en producción y después publicar el frontend.

## Qué cambia el SQL

- Ajusta las tres funciones `geocauce_can_view_project`, `geocauce_can_edit_project` y `geocauce_is_project_owner` para comprobar `deleted_at`, identidades JWT y los roles permitidos.
- Crea RPC de lectura `geocauce_project_role(text)`, `geocauce_my_project_roles()`.
- Crea RPC del propietario `geocauce_set_project_member(text,text,text)`, `geocauce_list_project_members(text)`, `geocauce_remove_project_member(text,uuid)`.
- Las invitaciones por email **solo funcionan cuando la cuenta ya existe**. Si no hay `personas` para ese `auth_user_id`, se crea un perfil mínimo nuevo con nombre igual a la parte local del correo. Si el email ya pertenece a un perfil desvinculado, falla sin apropiarse de ese perfil.
- Los usuarios con rol `owner` en la tabla de colaboradores se tratan como editores a nivel de interfaz. El propietario real sigue siendo `project.owner_user_id`.
- Usa borrado lógico `project_persona.deleted_at` al revocar, conservando la relación para reactivarla con otro permiso.
- Añade un trigger de inmutabilidad del propietario y de control de archivado.
- Crea restricciones RLS para impedir borrar snapshots a no propietarios y para los archivos del bucket `geocauce-files`. Estas restricciones se añaden sin reemplazar las políticas de propietario o colaboración existentes.
- No borra, renombra ni migra proyectos, snapshots, personas, fotografías, rasters ni archivos.

## URLs

En GitHub Pages, la URL `/project/UUID/edit` puede producir 404 al recargar. Por eso, la rama usa URLs funcionales `/?project=UUID` y `/?project=UUID&mode=edit`; el permiso proviene del JWT y de Postgres, **nunca de la URL**.

## Comprobación SQL tras instalar la migración (solo lectura)

```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN (
   'geocauce_project_role',
   'geocauce_my_project_roles',
   'geocauce_set_project_member',
   'geocauce_list_project_members',
   'geocauce_remove_project_member'
  )
ORDER BY proname;
```

```sql
SELECT schemaname,tablename,policyname,cmd,permissive
FROM pg_policies
WHERE (schemaname='storage' AND tablename='objects' AND policyname LIKE 'geocauce_assets_%_gate')
   OR (schemaname='public' AND policyname='geocauce_snapshot_owner_delete_gate')
ORDER BY schemaname,tablename,policyname;
```

Estos controles comprueban la estructura, no demuestran por sí solos que RLS funcione. Las pruebas con JWT reales y las operaciones directas a la API son imprescindibles.

## Observaciones y límites

- Sin conexión, el permiso que aparece en la interfaz podría estar en caché; **el servidor revalida cada acceso protegido y aplica revocaciones aunque el JWT no haya caducado**.
- Una revocación no borra copias ya exportadas ni elimina cachés en dispositivos desconectados.
- Las operaciones de sincronización y los archivos geográficos aún necesitan pruebas de integración. La CI de Node cubre parte del código, no la base de datos real.
- La migración SQL está preparada en GitHub; **no se ejecuta automáticamente** y no se ha probado todavía contra la instancia real del usuario.

Consulta también las políticas originales de `SUPABASE_LEGACY_OWNER_RLS_FIX.sql`; permanecen intactas.
