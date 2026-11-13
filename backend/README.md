# GeoCauce FastAPI · R42

Servicio ligero y privado para GeoCauce. **No es una implementación completa de Supabase**, solo los endpoints utilizados por la PWA heredada de R41 y una API REST estable `/api/v1`.

## Componentes

- FastAPI y documentación OpenAPI en `/docs`.
- SQLAlchemy y PostgreSQL 16 (JSONB para snapshots).
- JWT de acceso, refresh tokens de un solo uso, passwords Argon2.
- Usuarios privados creados desde CLI (registro público desactivado).
- Proyectos con propietario y permisos viewer/editor (aún sin despliegue multiusuario validado).
- Archivos guardados de forma privada en disco persistente, con rutas verificadas y escritura inmutable.
- Escrituras de snapshots con condición de versión comprobada en PostgreSQL.

## Endpoints principales

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Salud |
| POST | `/api/v1/auth/login` | Inicio de sesión |
| POST | `/api/v1/auth/refresh` | Renovación de sesión |
| GET | `/api/v1/auth/me` | Identidad |
| GET/POST | `/api/v1/projects` | Proyectos |
| GET/PUT | `/api/v1/projects/{id}/snapshot` | Snapshot versionado |
| POST | `/auth/v1/token?grant_type=password` | Compatibilidad R41 Auth |
| POST | `/auth/v1/token?grant_type=refresh_token` | Compatibilidad R41 Refresh |
| GET/POST | `/rest/v1/projects` | Catálogo R41 |
| GET/POST/PATCH | `/rest/v1/project_snapshots` | Snapshots R41 |
| POST | `/rest/v1/rpc/geocauce_project_role` | Rol |
| GET/POST | `/storage/v1/object/...` | Partes y archivos R41 |

Los GeoTIFF se fragmentan en partes de 8 MiB en R41. El backend evita sobrescribir una ruta con contenido diferente y no borra archivos automáticamente: la limpieza segura y migración quedan pendientes.

## Desarrollo y tests

```bash
cd backend
python -m pip install -r requirements-test.txt
PYTHONPATH=. pytest -q tests
```

Los tests cubren login privado, snapshots y versiones, archivos inmutables, permisos de colaboración, refresh y logout. En producción hay que verificar con PostgreSQL real y dos dispositivos, y configurar backups cifrados externos.

**Esquema:** se crea mediante `Base.metadata.create_all()` al arrancar una base vacía. Para cambios futuros en una base real, usar migraciones versionadas (Alembic), no `create_all()` para alterar columnas existentes.

**Seguridad:** no exponer directamente los puertos de PostgreSQL ni de Uvicorn; solo Caddy debe publicar 80 y 443. El alta pública está desactivada por defecto. Endurecer con limitación de intentos de login, supervisión y control de actualizaciones antes de abrirlo a investigadores externos.
