# Despliegue R42 en Contabo

**Estado: prueba / staging.** No sustituir todavía la instalación de Geocauce en GitHub Pages ni borrar datos de Supabase.

## 1. DNS y firewall

VPS Linux con Docker Engine y el plugin Docker Compose v2. Configura el registro DNS A de tu dominio/subdominio a la IPv4 del VPS. Abre TCP 80/443 y deja SSH restringido; PostgreSQL y Uvicorn NO se publican. El certificado TLS se obtiene automáticamente mediante Caddy cuando el DNS y los puertos son correctos.

## 2. Clonar y configurar

```bash
git clone --branch r42-20261113-monorepo https://github.com/laurasinu2/Geocauce.git
cd Geocauce
cp .env.example .env
openssl rand -hex 32  # introducir manualmente en POSTGRES_PASSWORD
openssl rand -hex 32  # introducir manualmente en JWT_SECRET (debe ser DISTINTO)
nano .env              # cambiar SITE_ADDRESS por el DNS real
chmod 600 .env
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api web
```

**Nunca** introduzcas contraseñas, claves privadas, service_role o JWT_SECRET dentro de `frontend/`. Deja `ALLOW_SIGNUP=false`. Antes de utilizar una cuenta real, exige HTTPS operativo en tu dominio.

## 3. Primera cuenta y comprobación

```bash
docker compose exec api python -m geocauce_api.create_user tu-correo@ejemplo.es
curl -fsS https://TU_DOMINIO/health
```

Usa contraseña nueva de mínimo 12 caracteres. Visita `https://TU_DOMINIO/docs` para Swagger y `https://TU_DOMINIO/` para la PWA. La cuenta creada inicialmente tendrá otro UUID que el de Supabase; eso es correcto para pruebas vacías, **pero no para una importación directa de proyectos ya asociados a otro propietario**.

## 4. Verificaciones antes de introducir datos únicos

1. Abre un proyecto de prueba y guarda una fotografía pequeña, una capa de ejemplo y sus fichas.
2. Sincroniza con la API y recupera desde un segundo navegador de prueba.
3. Comprueba cortes de red y que una versión vieja del mismo snapshot no sustituye la reciente.
4. Abre `/sw.js` y verifica que las rutas `/auth/`, `/rest/`, `/storage/` y `/api/` NO entran en la caché offline.
5. Realiza una copia de seguridad y ensaya una restauración en otra instalación vacía.

## 5. Migración posterior desde Supabase

La web nueva tiene OTRO origen respecto a GitHub Pages y por tanto otro IndexedDB y localStorage. Exporta antes de nada copias completas `.geocauce` desde ordenador y tablet. En Supabase respalda **tanto** tablas/snapshots de PostgreSQL **como** los objetos binarios del bucket `geocauce-files`. No basta un dump SQL. Guarda los UUID de Auth y de propietario y utiliza un mapeo verificado (o `create_user.py --id UUID_REAL` para una cuenta que todavía no existe). No apuntes la PWA habitual al servidor nuevo sin probar importación, fotos, mapas, trazados, permisos y sincronización cruzada.

El backend actual admite solo el **esquema moderno**, usando `projects` y `project_snapshots`. Si Supabase utiliza todavía el esquema clásico singular `project`, primero necesitamos una herramienta de conversión y validación; nunca ejecutar los SQL de inicialización de Supabase contra la base antigua sin revisar.

## 6. Copias de seguridad

```bash
./scripts/backup.sh
```

Se crean `backups/postgres-FECHA.dump` y `backups/files-FECHA.tar.gz`. Son dos conjuntos independientes. En producción hay que **cifrarlos, copiarlos fuera del VPS y programar pruebas periódicas de recuperación**. El script no copia `.env` ni los certificados de Caddy. Un volumen Docker NO es una copia de seguridad.

**Nunca ejecutar `docker compose down -v`** con datos que quieras conservar. `docker compose down` sin `-v` conserva los volúmenes, pero no reemplaza una copia.

## 7. Actualizaciones

```bash
git pull --ff-only
docker compose up -d --build
```

Antes de actualizar con datos reales hay que realizar backup y revisar cambios en la base de datos; esta primera versión todavía no tiene migraciones Alembic. No publicar esta rama como producción antes de completar las pruebas de acceso y de transferencia.
