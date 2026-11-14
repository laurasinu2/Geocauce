# GeoCauce · Monorepo R42 (FastAPI + Docker)

Esta rama **r42-20261113-monorepo** parte de **r41-20261111** y contiene la PWA, el backend FastAPI y Docker Compose en un mismo repositorio. **No sustituye R41 ni modifica Supabase.**

- `frontend/`: PWA R41 íntegra (README histórico: [frontend/README.md](frontend/README.md)), con los dos ajustes necesarios para la nube propia: `sw.js` y `supabase-config.js`.
- `backend/`: FastAPI, PostgreSQL, API compatible con las rutas de nube usadas en R41, autenticación y almacenamiento privado.
- `infra/Caddyfile`: HTTPS, frontend estático y proxy hacia la API.
- `scripts/`: copias de seguridad. `compose.yaml`: servicios Docker.

## Adminer (R49, solo por túnel SSH)

El Compose incluye Adminer en `127.0.0.1:8081` del VPS, sin acceso público ni cambios de credenciales. Instrucciones de despliegue, túnel SSH y acceso a PostgreSQL: [docs/R49_ADMINER.md](docs/R49_ADMINER.md). No importar dumps de Supabase directamente en la base `geocauce`.

## Credenciales PostgreSQL por GitHub Secrets (R49)

El despliegue manual requiere los **repository secrets** `DB_USERNAME` y `DB_PASSWORD`.
En una base existente deben coincidir con los valores de `POSTGRES_USER`
(si falta: `geocauce`) y `POSTGRES_PASSWORD` de `/opt/geocauce/.env`.
La contraseña debe tener 64 caracteres hexadecimales (generar con
`openssl rand -hex 32` **solo para una instalación nueva**). **No cambies
las credenciales de una base existente simplemente editando GitHub Secrets**.
Consulta [docs/R49_DB_GITHUB_SECRETS.md](docs/R49_DB_GITHUB_SECRETS.md).

## Uso en el VPS

```bash
# Ubuntu con Docker Engine + Compose v2 y DNS A apuntando al VPS
git clone -b r42-20261113-monorepo https://github.com/laurasinu2/Geocauce.git
cd Geocauce
cp .env.example .env
# Genera credenciales distintas y configura SITE_ADDRESS en .env
openssl rand -hex 32
openssl rand -hex 32
chmod 600 .env
docker compose config
docker compose up -d --build
docker compose exec api python -m geocauce_api.create_user tu-correo@ejemplo.es
```

Requiere DNS y HTTPS antes de usar credenciales reales. Abre `https://TU-DOMINIO/health` y `https://TU-DOMINIO/docs` para comprobar la API. Registros públicos desactivados por defecto.

**Migración pendiente**: La nueva web está en un origen distinto de GitHub Pages; IndexedDB, fotos y demás datos locales **no se transfieren automáticamente**. Haz copias `.geocauce` en todos los dispositivos y exporta SQL + bucket de Supabase antes de mover datos. No cambies la app estable hasta verificar sincronización de ordenador y tablet. `docker compose` arranca un sistema nuevo, vacío.

Consulta [backend/README.md](backend/README.md) para el contrato de API y [docs/DEPLOY.md](docs/DEPLOY.md) para despliegue seguro, copias y validaciones.

## Despliegue manual por GitHub Actions a Contabo

Hay un flujo **100 % manual** en `Actions → Deploy Geocauce to Contabo (manual)`. Selecciona la rama `r42-20261113-monorepo` y confirma `DESPLEGAR`. El workflow `workflow_dispatch` también está registrado en `main` únicamente para que GitHub muestre el botón, pero **no despliega la rama main**.

Antes del primer despliegue, configura el DNS/HTTPS, el usuario SSH, los secrets del entorno `contabo-production` y el archivo privado `/opt/geocauce/.env` en el servidor. **No se ha realizado ningún despliegue ni migración de Supabase.** La guía completa está en [docs/CI_CD_CONTABO.md](docs/CI_CD_CONTABO.md).
