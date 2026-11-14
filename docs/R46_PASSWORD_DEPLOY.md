# R46: despliegue manual de Geocauce con usuario y contraseña SSH

**Archivo para ejecutar en GitHub:** `.github/workflows/deploy-contabo.yml`.

El workflow está instalado en `main` para que aparezca en Actions, y en `fix/r46-password-deploy-20261114` para desplegar el código correcto. **No publica nada automáticamente** al hacer push. Solo despliega esa rama cuando se elige `DESPLEGAR`.

## Arquitectura web

No hace falta Apache ni Nginx. `compose.yaml` levanta **Caddy** para servir el frontend, gestionar TLS/HTTPS y redirigir las peticiones de API a FastAPI. La base PostgreSQL y el almacenamiento binario están en volúmenes privados de Docker. No se publican los puertos de PostgreSQL ni FastAPI.

## Preparación mínima del VPS (una sola vez)

- Docker Engine + Docker Compose v2, `curl`, `flock` y `openssl` instalados.
- Usuario SSH con **contraseña habilitada** y permisos para Docker. El usuario `geocauce-deploy` creado con `--disabled-password` no acepta contraseña hasta ejecutar `sudo passwd geocauce-deploy` como administrador. Si el servicio SSH no permite autenticación por contraseña, el workflow fallará: no modificar su política sin comprender los riesgos. Es más seguro usar un usuario dedicado y limitar accesos SSH; evita guardar la contraseña de `root` en GitHub cuando sea posible.
- El directorio `/opt/geocauce` debe existir y pertenecer al usuario de despliegue. Por ejemplo, como administrador del VPS: `install -d -m 700 -o geocauce-deploy -g geocauce-deploy /opt/geocauce`. La pipeline crea la subcarpeta `incoming`.
- Un dominio/subdominio DNS público (por ejemplo, `geocauce.duckdns.org`) que **apunte al VPS**, con los puertos 80/443 accesibles para Caddy y para la emisión de certificados TLS. **DuckDNS no oculta la IP del VPS.** Si prefieres una IP oculta, se necesita adaptar el despliegue a un túnel antes de ejecutarlo.

El workflow **no instala Docker ni habilita el acceso SSH por contraseña automáticamente** y no puede obtener un dominio por sí solo.

## Secrets de GitHub (en el Environment `contabo-production`)

Ir a `Settings → Environments → contabo-production → Environment secrets` y crear:

| Secret | Valor |
|---|---|
| `CONTABO_HOST` | IP pública o hostname SSH de Contabo |
| `CONTABO_USER` | Usuario con SSH por contraseña y acceso a Docker (`geocauce-deploy` recomendado) |
| `CONTABO_PASSWORD` | Contraseña SSH de ese usuario |
| `CONTABO_SSH_FINGERPRINT` | Huella pública **ED25519 SHA256** real del servidor, como `SHA256:abcd...`. Obtenerla desde la consola de confianza del VPS con `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256` y copiar el token completo que comienza por `SHA256:` |
| `GEOCAUCE_SITE_ADDRESS` | Dominio sin `https://`, por ejemplo `geocauce.duckdns.org` |

Opcional: variable de entorno `CONTABO_SSH_PORT`, predeterminado `22`.

**No compartir contraseñas en chats ni añadirlas al repositorio.** GitHub mantiene los secrets cifrados y solo los entrega al job protegido. Configura las reglas de despliegue de `contabo-production` para permitir únicamente la rama R46.

La huella de servidor es una garantía de identidad: el workflow consulta la clave pública SSH y aborta si no coincide exactamente con la huella verificada; nunca usa `StrictHostKeyChecking=no`.

## Primer despliegue

1. Comprobar que funciona `ssh geocauce-deploy@IP_DEL_VPS` **mediante contraseña** y `docker compose version` desde esa cuenta.
2. Comprobar que DNS resuelve la IPv4 del servidor y que los puertos 80/443 no están ocupados por otro servidor web.
3. Abrir **Actions → Deploy Geocauce to Contabo (manual)**.
4. En `Run workflow`, seleccionar **`fix/r46-password-deploy-20261114`** y `confirm = DESPLEGAR`.
5. El workflow ejecuta tests, instala `sshpass` **solo en el runner temporal de GitHub**, verifica la identidad SSH del VPS, se conecta con usuario/contraseña, transfiere el código y ejecuta `scripts/deploy-contabo.sh`.
6. En una **primera instalación vacía**, el script genera y guarda `POSTGRES_PASSWORD` y `JWT_SECRET` en `/opt/geocauce/.env` con permisos privados; nunca imprime sus valores. Si el archivo ya existe, conserva los secretos. Si no hay datos todavía y solo existe un hostname de ejemplo, puede corregirlo. Si el hostname difiere en una instalación existente, aborta sin reescribirlo.
7. Levanta `web` (Caddy), `api` (FastAPI) y `db` (PostgreSQL), valida el estado de los contenedores y solicita `https://<dominio>/health` antes de confirmar la nueva versión.

Las actualizaciones posteriores incluyen copia de seguridad previa de PostgreSQL y de los binarios en `/opt/geocauce/backups`, sin eliminar los volúmenes. También es necesario configurar copias cifradas fuera del VPS.

## Qué queda por preparar después

- Crear la primera cuenta FastAPI con `python -m geocauce_api.create_user` dentro del contenedor API (el registro público está deshabilitado).
- Probar con un proyecto nuevo de prueba y verificar las fotos, GeoTIFF y restauración desde otro navegador.
- Los datos actuales de `localhost` **no se migran automáticamente** al VPS.
- Si el servidor usa Tailscale Funnel o Cloudflare Tunnel, esta variante de la pipeline no publica por túnel; antes hay que adaptar Caddy/Compose y la comprobación de HTTPS.

## Limitaciones

La autenticación por contraseña SSH es menos resistente que la autenticación con claves. Usa una contraseña fuerte y exclusiva, permisos reducidos, protección del entorno de GitHub y, si es posible, reglas SSH para limitar el origen. Si el VPS no admite `PasswordAuthentication`, la ejecución se detendrá sin intentar modificar `sshd`.

La pipeline solo se considera lista para producción tras una **primera ejecución real satisfactoria** en Contabo. Las pruebas CI no sustituyen el acceso real al servidor ni la verificación DNS.
