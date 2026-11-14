# R47 · Desplegar desde GitHub Actions usando secretos del repositorio

Este despliegue es **manual**, sin `environment:` de GitHub, y se publica desde la rama `fix/r47-repository-secrets-deploy-20261114`.

## Configuración en GitHub

En **Settings → Secrets and variables → Actions → Repository secrets**, guarda:

| Nombre | Contenido |
|---|---|
| `CONTABO_HOST` | IP o hostname SSH del VPS |
| `CONTABO_USER` | Usuario SSH con contraseña y permisos de Docker (se recomienda `geocauce-deploy`) |
| `CONTABO_PASSWORD` | Contraseña SSH del usuario |
| `CONTABO_SSH_FINGERPRINT` | Fingerprint público ED25519 `SHA256:...` comprobado en consola segura del VPS |
| `GEOCAUCE_SITE_ADDRESS` | Dominio público, por ejemplo `geocauce.duckdns.org` |

`GEOCAUCE_SITE_ADDRESS` también se acepta como **Repository variable**, con el mismo nombre, si prefieres guardar el dominio (no es un secreto) en **Variables**. Si existen ambos, tiene prioridad el secreto.

`CONTABO_SSH_PORT` es opcional y se acepta como secreto o variable de repositorio; si no existe, usa `22`.

Ya **no necesitas crear ni usar `contabo-production`** en GitHub Environments.

## Corregido: el error del dominio

La pipeline acepta estas dos entradas y las normaliza antes de conectar:
- `geocauce.duckdns.org`
- `https://geocauce.duckdns.org/`

No acepta una ruta como `https://geocauce.duckdns.org/pagina`; debe ser solo el dominio. Si falla, revisa el valor de `GEOCAUCE_SITE_ADDRESS` en GitHub y asegúrate de que el DNS resuelve al VPS.

## Ejecutar

En **Actions → Deploy Geocauce to Contabo (manual) → Run workflow**:
- **Branch**: `fix/r47-repository-secrets-deploy-20261114`
- **Confirm**: `DESPLEGAR`

El workflow ejecuta pruebas, verifica la huella SSH, conecta por contraseña, transfiere R47, conserva el archivo `/opt/geocauce/.env` existente y los volúmenes, y verifica HTTPS antes de confirmar la versión. En la primera instalación vacía genera credenciales internas fuertes en el VPS. Las actualizaciones requieren copia de PostgreSQL y los archivos antes del despliegue.

## Arquitectura

El servidor web es **Caddy**, incluido en Docker Compose. No hace falta Apache ni Nginx. Caddy publica el frontend y HTTPS y redirige la API a FastAPI; PostgreSQL queda en la red privada Docker.

**Atención:** R47 usa Caddy con DNS tradicional. Si `geocauce.duckdns.org` apunta a una IP doméstica o a una dirección distinta del VPS, el despliegue fallará al emitir HTTPS. Si quieres que los visitantes no puedan ver la IP de Contabo mediante DNS, **esta configuración todavía no lo consigue**: hay que adaptar Docker y la pipeline a un servicio de túnel antes de publicar. Nunca compartas aquí la contraseña SSH; cambia cualquier contraseña previamente expuesta en chats.

Al quitar `environment:`, GitHub ya no aplica protecciones de entorno o aprobaciones obligatorias de ese entorno. Limita permisos de escritura del repositorio y protege la rama de despliegue. El workflow sigue requiriendo `DESPLEGAR` y la rama exacta.

## Validación

`R47 repository secrets deploy regression` valida que el job no depende de entornos, que utiliza secretos del repositorio, el fingerprint y la verificación SSH, y que se conservan las pruebas frontend, backend y de Docker. El CI no confirma acceso real a tu VPS ni despliega nada.
