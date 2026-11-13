# CI/CD manual: GitHub Actions → VPS Contabo

Workflow: [Deploy Geocauce to Contabo (manual)](../.github/workflows/deploy-contabo.yml).

**Rama de aplicación:** `fix/r45-cloud-blob-mime-20261113`.
**Disparador:** únicamente `workflow_dispatch` con confirmación explícita `DESPLEGAR`. No se despliega con `push` ni con `pull_request`.
**Importante:** el archivo de registro del workflow también existe en `main` para que GitHub muestre `Run workflow`. El workflow rechaza cualquier rama distinta de R45. No se fusionan los archivos del frontend/backend en `main`.

## Preparación inicial del VPS (una sola vez)

Necesitas Ubuntu/Debian con **Docker Engine + plugin Docker Compose v2**, Git no es obligatorio para el despliegue. Sigue las [instrucciones oficiales de Docker](https://docs.docker.com/engine/install/ubuntu/) para instalarlo. Necesitas DNS `A` del dominio público apuntando a la IPv4 del VPS y puertos TCP 80/443 abiertos (UDP 443 es opcional para HTTP/3). Configura un firewall, mantén SSH actualizado y usa acceso por clave.

Entra por SSH con tu usuario administrador y crea un usuario dedicado:

```bash
sudo adduser --disabled-password --gecos "" geocauce-deploy
sudo usermod -aG docker geocauce-deploy
sudo install -d -o geocauce-deploy -g geocauce-deploy -m 700 /home/geocauce-deploy/.ssh
sudo install -d -o geocauce-deploy -g geocauce-deploy -m 700 /opt/geocauce
sudo apt-get update && sudo apt-get install -y curl
```

**Advertencia:** pertenecer al grupo Docker equivale, a efectos de seguridad, a disponer de privilegios cercanos a root. Da acceso únicamente a esta cuenta de despliegue, protege sus claves y evita reutilizarla para otras aplicaciones. Cierra y vuelve a abrir la sesión SSH del usuario después de añadirlo al grupo Docker.

### Clave SSH dedicada (en tu ordenador, no en GitHub)

En Windows PowerShell puedes generar una clave independiente:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\geocauce_contabo_actions" -C "geocauce-github-actions"
Get-Content "$env:USERPROFILE\.ssh\geocauce_contabo_actions.pub"
```

Para uso no interactivo en Actions, la clave dedicada debe poder usarse sin solicitar una contraseña interactiva (o tendrás que ampliar el workflow para iniciar un agente). Usa una clave **exclusiva para este despliegue**.

Copia **solo la clave pública** mostrada (una línea que empieza con `ssh-ed25519`) en el VPS:

```bash
sudo nano /home/geocauce-deploy/.ssh/authorized_keys
# Pega la clave pública completa en una línea.
sudo chown geocauce-deploy:geocauce-deploy /home/geocauce-deploy/.ssh/authorized_keys
sudo chmod 600 /home/geocauce-deploy/.ssh/authorized_keys
```

Desde tu ordenador comprueba que puedes acceder como usuario de despliegue:

```powershell
ssh -i "$env:USERPROFILE\.ssh\geocauce_contabo_actions" geocauce-deploy@IP_O_HOST_DE_CONTABO
```

Comprueba que este usuario puede ejecutar `docker compose version` y `docker info`. Es preferible desactivar autenticación SSH por contraseña una vez probado el acceso por clave, sin perder tu acceso de administrador.

### Preparar el .env únicamente en el servidor

En el VPS, conectado como `geocauce-deploy`:

```bash
nano /opt/geocauce/.env
chmod 600 /opt/geocauce/.env
```

Contenido (sustituye los valores por los definitivos):

```dotenv
POSTGRES_PASSWORD=HEX_ALEATORIO_DE_64_CARACTERES
JWT_SECRET=OTRO_HEX_ALEATORIO_DE_64_CARACTERES
SITE_ADDRESS=geocauce.tudominio.es
ALLOW_SIGNUP=false
MAX_UPLOAD_BYTES=16777216
```

Genera **dos valores diferentes** con `openssl rand -hex 32`. El dominio debe ser real y público, no `localhost` ni `geocauce.example.org`. No coloques aquí credenciales de Supabase. Nunca incluyas `.env` en Git. No cambies `POSTGRES_PASSWORD` después de inicializar la base sin planificar una rotación de credenciales.

No hace falta clonar el repositorio en Contabo: Actions sube la release verificada y crea los directorios `/opt/geocauce/releases/<commit>` automáticamente. Los datos residen en los volúmenes Docker `geocauce_postgres_data` y `geocauce_files_data`.

## Configuración de GitHub

Abre el repositorio → **Settings → Environments → New environment** y crea **`contabo-production`**. Se recomienda configurar revisión manual por un aprobador si las opciones del repositorio lo permiten y limitar el entorno a la rama `fix/r45-cloud-blob-mime-20261113`.

En **Environment secrets** crea:

| Secret | Contenido |
| --- | --- |
| `CONTABO_HOST` | IP pública IPv4 o hostname SSH (sin `ssh://`, sin puerto) |
| `CONTABO_USER` | `geocauce-deploy` |
| `CONTABO_SSH_PRIVATE_KEY` | Contenido completo del archivo privado `geocauce_contabo_actions`, **no** el `.pub` |
| `CONTABO_SSH_KNOWN_HOSTS` | Línea verificada de `known_hosts` correspondiente al servidor y su puerto |

En **Environment variables** puedes definir `CONTABO_SSH_PORT`. Si no se define, se utiliza `22`.

### Verificar la huella del servidor SSH (obligatorio)

**No uses `StrictHostKeyChecking=no` ni aceptes una clave obtenida de la red sin verificarla.** Desde la consola administrativa de Contabo ejecuta:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

En tu ordenador recupera la línea pública del servidor (sustituye host y puerto):

```bash
ssh-keyscan -p 22 -t ed25519 IP_O_HOST_DE_CONTABO > contabo-known-hosts.txt
ssh-keygen -lf contabo-known-hosts.txt
```

**Compara ambas huellas SHA256.** Solo si coinciden, copia la línea del fichero `contabo-known-hosts.txt` al secret `CONTABO_SSH_KNOWN_HOSTS`. Para un puerto distinto de 22, la línea normalmente empieza por `[host]:puerto` y el valor `CONTABO_HOST` debe coincidir. Si cambia la clave del servidor, verifica la causa antes de actualizarla.

Nunca publiques ni envíes por chat el contenido de `CONTABO_SSH_PRIVATE_KEY`, `.env` o claves de PostgreSQL/JWT.

## Ejecutar el despliegue (solo cuando tú lo decidas)

1. Entra en [GitHub Actions](https://github.com/laurasinu2/Geocauce/actions).
2. Selecciona **Deploy Geocauce to Contabo (manual)**.
3. Pulsa **Run workflow**, elige la rama **`fix/r45-cloud-blob-mime-20261113`** y la opción **`DESPLEGAR`**.
4. Ejecuta y revisa las dos tareas: `verify` y `deploy`.

Si seleccionas `main` o no confirmas, el workflow **falla antes de abrir conexión SSH**, por diseño. El workflow corre con `contents: read`, no modifica el repositorio y no crea ni borra usuarios de Supabase.

La fase `verify` comprueba:
- SHA de checkout, estructura del monorepo y sintaxis del script Bash.
- Tests del backend con `pytest`.
- Sintaxis JavaScript y test de autenticación del frontend.
- Validez básica de Docker Compose.

**No pasa aún la suite completa de frontend:** R45 tenía tests heredados fallando. La comprobación no significa que la sincronización con datos reales esté validada. No usar la nueva instalación para datos únicos hasta completar pruebas manuales.

La fase `deploy`:
1. Empaqueta únicamente el código necesario y lo transmite por SSH con clave de host verificada.
2. Verifica `/opt/geocauce/.env`, la configuración Docker y la rama/commit.
3. Si existe base de datos, hace **copia local obligatoria** de PostgreSQL y los archivos antes de actualizar.
4. Ejecuta `docker compose up -d --build --wait` con los mismos volúmenes persistentes.
5. Comprueba `https://DOMINIO/health`, la web y `supabase-config.js`.
6. Solo después marca la release como `/opt/geocauce/current`. Si falla durante la actualización, intenta volver a levantar los contenedores de la release anterior.

El rollback **no revierte cambios de esquema ni sustituye un proceso de restauración de datos**. Nunca uses `docker compose down -v` sobre un servidor con proyectos importantes.

## Verificación y copias fuera de Contabo

En el VPS:

```bash
ls -l /opt/geocauce/current
ls -l /opt/geocauce/backups
docker compose --env-file /opt/geocauce/.env -f /opt/geocauce/current/compose.yaml ps
```

La primera instalación parte de una BD vacía. Crea una cuenta desde la consola SSH:

```bash
docker compose --env-file /opt/geocauce/.env \
  -f /opt/geocauce/current/compose.yaml \
  exec api python -m geocauce_api.create_user tu-correo@ejemplo.es
```

Visita `https://TU_DOMINIO/` y `https://TU_DOMINIO/docs`. Prueba con proyectos ficticios. **Los datos de IndexedDB almacenados en GitHub Pages y las credenciales de Supabase no se migran automáticamente.**

Las copias creadas por el pipeline son **locales en el mismo VPS y sin cifrado de extremo a extremo**: configura aparte traslado cifrado fuera del servidor, retención y pruebas de recuperación. Revisa el espacio disponible antes de despliegues repetidos; la tarea no borra copias antiguas.

## Problemas frecuentes

- **No aparece Run workflow:** refresca Actions. El archivo está registrado también en `main` porque GitHub lo exige para `workflow_dispatch`. Revisa permisos de Actions.
- **Permission denied (publickey):** usuario equivocado, clave privada distinta, falta en `authorized_keys` o permisos SSH.
- **Host key verification failed:** secret `CONTABO_SSH_KNOWN_HOSTS` no coincide con el servidor/puerto. Verifica la huella de nuevo, no desactives la comprobación.
- **Falta `.env`:** debe estar en `/opt/geocauce/.env`, no dentro de una release.
- **Docker permission denied:** el usuario `geocauce-deploy` aún no tiene permisos Docker o falta una nueva sesión.
- **Error HTTPS:** revisa DNS, puertos, dominio y certificados Caddy. El backend puede estar bien y el proxy inaccesible.
- **Persistent data exists without previous release:** detección protectora. No borres los volúmenes; inspecciona antes de reintentar.
- **Backup failed:** despliegue bloqueado. Revisa espacio en disco, integridad de los volúmenes y estado de PostgreSQL.

## Referencias

- [Documento de despliegue del monorepo](DEPLOY.md)
- [Manual workflows, GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Docker Engine en Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
