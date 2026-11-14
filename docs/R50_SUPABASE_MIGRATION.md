# R50 · Migración segura desde Supabase Cloud al backend propio

> Estado: fase 1 (auditoría / preflight), **sin importación automática ni cambios en Contabo**.
> Rama base: `fix/r49-recovery-healthcheck-20261114`.
> No subir archivos `.dump`, exports de usuarios, objetos privados ni credenciales al repositorio.

## Inspección realizada sobre el backup adjuntado (2026-11-14)

- Formato `PGDMP` válido (PostgreSQL custom dump); tamaño aproximado de 2,4 MB.
- Cabecera del archivo: base PostgreSQL **17.6**, herramienta de exportación **18.6**.
- El esquema `public` incluye **`project`** (singular), `project_persona` y
  `project_snapshots`; el último contiene `id_project`, `schema_version`,
  `state`, `created_at`, `revision`, `updated_at`.
- `public.project` tiene `id_project`, `owner_user_id`, `name`, `zona`,
  `torrent`, `crs`, `revision`, `deleted_at`, entre otros campos.
- Hay esquemas Supabase `auth`, `storage` y otros esquemas gestionados.
- La presencia de metadatos `storage.objects` NO implica que estén los ficheros
  de Storage en el dump. Se necesitan los binarios del bucket.
- No se ha ejecutado restauración ni lectura completa de filas para este análisis.
  **No conocemos todavía cuántos proyectos, registros o blobs se pueden recuperar.**

**Resultado:** incompatible con una restauración directa sobre la base operativa
del backend R49/R50, que crea sus propias tablas `users`, `projects`,
`project_snapshots`, `project_members` y `refresh_sessions`.

## Preflight reproducible

En el equipo que tenga `pg_restore` instalado, con el dump fuera del repo:

```bash
python3 scripts/r50-dump-preflight.py /ruta/privada/geocauce_backup.dump
```

Opcionalmente, guarda únicamente el inventario de metadatos:

```bash
python3 scripts/r50-dump-preflight.py /ruta/privada/geocauce_backup.dump --json /ruta/privada/preflight.json
```

La herramienta solo llama a `pg_restore --list`. No se conecta a ningún servidor,
no extrae filas, no restaura ni reescribe archivos.

## Secuencia obligatoria antes del importador R50

1. **Conservar el origen.** No tocar Supabase Cloud y obtener exportaciones `.geocauce`
   de ordenador y tablet. El cambio de origen de la PWA provoca un IndexedDB distinto.
2. **Respaldar el VPS.** Guardar exportaciones verificables del PostgreSQL propio y del
   volumen privado de ficheros, cifradas fuera del VPS. Nunca `docker compose down -v`.
3. **Staging aislado.** Restaurar el dump a una base temporal sin conectar a la
   aplicación. Usar versiones/extensiones compatibles; no sobrescribir `geocauce`
   ni restaurar esquemas `auth`/`storage` directamente sobre la base de la API.
4. **Inventario de filas.** Comprobar recuentos por tabla y vínculos del modelo legado:
   `project.id_project` ↔ `project_snapshots.id_project`,
   `project.owner_user_id` ↔ `auth.users.id`, permisos `project_persona`
   y otras relaciones relevantes. Revisar proyectos borrados (`deleted_at`).
5. **Conversión, no restauración directa.** Diseñar un importador idempotente de
   `public.project` → `projects` y del snapshot al contrato FastAPI.
   Verificar que `project_snapshots.state` sea representativo, ya que el SQL
   declara que los snapshots son una copia de compatibilidad y que las tablas
   normalizadas son la fuente de verdad.
6. **Identidades.** Crear usuarios con UUID preservados usando el mecanismo
   `create_user.py --id` solo tras verificar la correspondencia de email y
   propietario; solicitar contraseñas nuevas. Nunca copiar tokens de Supabase
   para reutilizarlos como JWT del backend propio.
7. **Archivos.** Exportar separadamente los binarios de Supabase Storage y verificar
   hashes, claves y referencias antes de moverlos a `files_data`.
8. **Ensayo.** Restaurar en una instalación de prueba aislada y cotejar proyectos,
   fotos, mapas, fichas, acceso viewer/editor y sincronización ordenador/tablet,
   incluyendo desconexiones y conflictos de versiones.
9. **Cambio de conexión solo al final.** Mantener GitHub Pages y Supabase originales
   operativos hasta que las comprobaciones hayan terminado.

## Riesgos y límites concretos

- El dump contiene también objetos internos gestionados por Supabase; es peligroso
  hacer `pg_restore -d geocauce geocauce_backup.dump`.
- La estructura de snapshots legada incluye `revision`; el backend propio guarda
  otra representación y aplica control de versiones. No asignar revisiones a ciegas.
- Los permisos del modelo legado deben traducirse, no descartarse.
- El backend de R49 no es Supabase Self-Hosted completo.
- Falta validar la exportación real de Storage y el funcionamiento en dos dispositivos.

## Decisión de R50

Esta primera entrega establece un preflight de solo lectura y un protocolo de
migración. **La importación real, traslado de Storage y despliegue quedan pendientes.**
No ejecutar importaciones en producción hasta tener una conversión probada y con rollback.
