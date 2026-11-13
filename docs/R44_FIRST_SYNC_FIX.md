# R44 · Primer guardado remoto de proyectos nuevos (13/11/2026)

Rama de pruebas: `fix/r44-first-cloud-sync-20261113`, basada en `fix/r43-local-save-verification-20261113`.

## Problema reproducido mediante el contrato de API

Con FastAPI/PostgreSQL recién instalado, Geocauce R43 creaba proyectos en IndexedDB pero la primera sincronización fallaba con `HTTP 404`:

1. El frontend solicitaba `GET /rest/v1/project_snapshots?project_id=eq.<uuid>` antes de registrar el proyecto.
2. FastAPI devolvía 404 porque aplicaba `require_role()` al proyecto inexistente. PostgREST devolvería un array vacío cuando la fila no existe.
3. Incluso devolviendo `[]`, R43 intentaba subir fotos y GeoTIFF al almacenamiento antes de crear el registro `projects`. El backend necesita comprobar que el archivo pertenece a un proyecto que ya existe.
4. R43 fijaba `ownerUserId` local **antes** de confirmar el snapshot remoto; un fallo posterior podía dejar el cliente marcado incorrectamente.

## Corrección

- `backend/geocauce_api/app.py`: si el proyecto no existe, la consulta de snapshots responde `[]`; si existe pero el usuario carece de permisos, sigue respondiendo 404.
- `frontend/app.js`: para el esquema moderno, registra el proyecto en la base remota antes de subir binarios. Posteriormente guarda el snapshot; `ownerUserId` local y el indicador de sincronización se confirman solo después de un snapshot remoto válido.
- `frontend/index.html` y `frontend/sw.js`: nueva versión de caché R44.
- Tests añadidos: reintento de subida interrumpida, orden de pasos, archivos, permisos, primera subida y rechazo de versiones antiguas.

Se conservan todos los mapas, fotos, geometrías y fichas locales. Ninguna tabla de PostgreSQL es borrada ni se ejecutan migraciones destructivas. R43, R42 y `main` permanecen intactas.

## Probar en local (PowerShell)

**Antes:** exporta una copia `.geocauce` del proyecto de prueba; no pulses «Restaurar desde nube».

```powershell
git status
git fetch origin
git switch fix/r44-first-cloud-sync-20261113
docker compose up -d --build
docker compose ps
```

Si `git status` muestra cambios no confirmados, guarda esos cambios antes de cambiar de rama.

1. Abre `http://localhost/` y fuerza actualización de la PWA si aún usa scripts antiguos.
2. Abre el proyecto de prueba que contiene el cauce/tramo, foto y mapa.
3. Pulsa «Sincronizar ahora». No pulses «Restaurar desde nube».
4. Verifica `/rest/v1/project_snapshots` en la pestaña Network (debe devolver 200).
5. Comprueba en PostgreSQL que el proyecto y el snapshot existen:

```powershell
docker compose exec db psql -U geocauce -d geocauce -c "SELECT id, name FROM projects;"
docker compose exec db psql -U geocauce -d geocauce -c "SELECT project_id, updated_at FROM project_snapshots;"
```

6. Abre otro perfil del navegador en `localhost`, inicia sesión y verifica la recuperación del proyecto. **No elimines los datos del primer perfil**.

## Limitaciones

Esta rama no está desplegada en Contabo. El workflow de despliegue manual actual solo acepta R42; habrá que actualizarlo o integrar R44 en la rama objetivo cuando se verifique la sincronización real. La suite completa de frontend de R41/R42 tiene fallos heredados y no está totalmente validada.

GitHub Actions R44: `frontend: 5/5`, `backend: 8/8`, `compose: OK`. Las pruebas son simuladas y unitarias; la verificación cruzada real con navegador, volumen Docker y redes interrumpidas sigue pendiente.
