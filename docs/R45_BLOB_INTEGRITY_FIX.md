# R45 · Error SHA-256 al restaurar fotografías desde FastAPI

Rama: `fix/r45-cloud-blob-mime-20261113`, derivada de `fix/r44-first-cloud-sync-20261113`.

## Síntoma

El primer navegador podía subir el proyecto (mapas y fotografías) y PostgreSQL contenía 1 proyecto y 1 snapshot. Al abrir desde un segundo navegador, la descarga se detenía con:

```
El archivo cloud no coincide con su huella digital: IMG_4839.jpeg
```

Geocauce no aplicaba el snapshot descargado; esto protege la copia local y es el comportamiento correcto ante una verificación fallida.

## Causa

FastAPI responde las descargas de `/storage/v1/object/authenticated/geocauce-files/...` como `Content-Type: application/octet-stream`, independientemente del tipo MIME original del archivo.

La huella `sha256-chunks-v1:<size>:<blob.type>:<digest>` incluye el tipo MIME original, que también es parte de la entrada del cálculo de SHA-256 por fragmentos. En R44 `cloudDownloadBlob` devolvía directamente `response.blob()` cuando el archivo tenía una sola parte; el `Blob` descargado tenía tipo `application/octet-stream` aunque la fotografía original fuera `image/jpeg`. Los archivos fragmentados sí se reconstruían con el tipo original.

## Solución

En `frontend/app.js`, `cloudDownloadBlob` **siempre** reconstruye los bytes con `new Blob(blobs, {type: type || ''})`, tanto con una parte como con varias.

- Se mantiene la validación de tamaños y SHA-256. No se aceptan archivos con bytes modificados.
- No se modifica PostgreSQL, el almacenamiento binario remoto ni la lógica de subidas.
- No se elimina ni se reemplaza ningún proyecto. La corrección solo cambia cómo se reconstruye un archivo en memoria antes de verificarlo.
- Se cambian la versión del script y el identificador de caché del service worker para que la PWA reciba R45.

## Pruebas automáticas

- JPEG pequeño servido con `application/octet-stream`: bytes, tipo MIME y SHA-256 originales coinciden.
- GeoTIFF pequeño: restauración de tipo y huella.
- GeoTIFF con dos fragmentos de 8 MiB: reensamblado y huella.
- Archivo con un byte cambiado: la huella sigue fallando.
- Archivo de MIME vacío: el tipo vacío y la huella se mantienen.
- Tests de R43 y R44 sobre guardado local, primera subida y reintentos.
- Pruebas del backend FastAPI y validación de Docker Compose.

Resultado en GitHub Actions: **10/10 pruebas específicas de frontend, 8/8 de backend y configuración Compose válida**.

## Validación manual en localhost

1. En el **navegador original**, exportar una copia `.geocauce` y conservar IndexedDB.
2. Actualizar la rama R45 y reconstruir la instalación sin borrar volúmenes:

```powershell
git status
git fetch origin
git switch fix/r45-cloud-blob-mime-20261113
docker compose up -d --build
```

3. En el **segundo navegador**, abrir `http://localhost/`, actualizar con `Ctrl+Shift+R` y, si fuera necesario, cerrar y volver a abrir solo ese navegador para que cambie de versión la PWA.
4. Iniciar sesión con la misma cuenta FastAPI y abrir el proyecto remoto. Comprobar la fotografía anteriormente rechazada, todas las fotografías, el GeoTIFF, el cauce, el tramo y las fichas.
5. No usar «Restaurar desde nube» en el **primer** navegador ni borrar su almacenamiento local. Comprobar después una nueva sincronización bidireccional con cambios de prueba.

**Pendiente:** validación manual con la copia de datos real. La rama R45 tampoco está desplegada en Contabo; el workflow manual creado anteriormente sigue restringido a R42.

## Seguridad

Ante otra huella incorrecta no desactivar la comprobación ni forzar la restauración. Inspeccionar errores en Console y Network, validar el MIME y tamaño remoto, y conservar las copias locales hasta resolverlo.
