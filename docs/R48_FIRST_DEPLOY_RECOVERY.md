# R48: recuperación segura del primer despliegue y espera del HTTPS

Se ha verificado en los logs del VPS que Caddy consiguió el certificado Let's Encrypt para `geocauce.duckdns.org` después de que la prueba HTTPS de R47 fallase demasiado pronto.

## Correcciones

1. El script de despliegue espera con varios reintentos errores de handshake TLS (también `curl` 35), hasta que Caddy tenga disponible el certificado. No deshabilita ninguna validación TLS.
2. Si un primer despliegue creó volúmenes, arrancó `geocauce-db-1`, `geocauce-api-1` y `geocauce-web-1`, pero no llegó a crear el enlace `/opt/geocauce/current`, el script permite recuperar la instalación **solo si** los tres contenedores están en estado healthy, sus etiquetas Docker los identifican como servicios de Geocauce y todos usan exactamente el mismo fichero Compose en `/opt/geocauce/releases/<commit>/compose.yaml`.
3. Antes de ejecutar R48, realiza backup de la base PostgreSQL y del volumen de archivos en `/opt/geocauce/backups`. Conserva secretos ya existentes y todos los volúmenes. Si no puede verificar el origen de los contenedores o faltan servicios sanos, se detiene y exige recuperación manual.
4. Mantiene la posibilidad de rollback a la versión previa encontrada en las etiquetas de Docker.

## Cómo desplegar

En `https://github.com/laurasinu2/Geocauce/actions/workflows/deploy-contabo.yml`, pulsa `Run workflow`, selecciona la rama `fix/r48-first-deploy-tls-recovery-20261114` y elige `DESPLEGAR`. Los GitHub Repository secrets configurados en R47 siguen siendo válidos.

Nunca ejecutes `docker compose down -v` ni borres los volúmenes para solucionar un fallo de certificado. No hay que volver a escribir las contraseñas de PostgreSQL ni de JWT.

Si la aplicación ya funciona en `https://geocauce.duckdns.org/`, eso no garantiza que se haya marcado como release `current`; la recuperación R48 realiza la comprobación y finaliza el despliegue.

## Validación

La pipeline de pruebas R48 comprueba la sintaxis del shell, la existencia de controles de recuperación, el reintento TLS, el formato de workflow y que los test de frontend y backend sigan pasando. La prueba real del VPS solo puede realizarse al lanzar manualmente la pipeline.

Esta variante utiliza DNS directo con Caddy: el dominio no oculta la IP pública de Contabo. Para utilizar un túnel y ocultarla hay que adaptar la arquitectura.
