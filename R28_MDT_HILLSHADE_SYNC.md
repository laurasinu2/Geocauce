# GeoCauce r28 · Hillshade y sincronización de MDT grandes

## MDT de referencia recibido

- Archivo: `MDT.tif`; GeoTIFF Float32 monobanda, 4396 × 4328, píxel de 0,5 m, EPSG:25831.
- Tamaño físico: 76.156.218 bytes (72,63 MiB), sin compresión.
- El error `The object exceeded the maximum allowed size` se produce al intentar enviar el TIFF original como un único objeto de Supabase Storage. La configuración concreta del límite pertenece al proyecto/bucket y no se modifica desde esta rama.

## Nuevo renderizador Hillshade (ombrejat)

En **Estilo del GeoTIFF / MDT → Renderizador → Ombrejat de relleu (Hillshade)**:

- Azimut 315° (por defecto), altitud solar 45° y factor Z 1, siguiendo la configuración de la captura QGIS.
- **Invertir relieve** cambia el signo del gradiente del MDT para invertir la lectura visual de valles y crestas. **No gira la imagen, no invierte sus coordenadas, ni altera los valores de altura**. La orientación geográfica se trata por separado.
- Sombreado Horn 3×3, dimensión física del píxel (m/píxel), áreas NoData transparentes, edición y previsualización en vivo.
- Al guardar se generan teselas con halo de 1 píxel para evitar costuras y una vista general. El GeoTIFF fuente sigue intacto en almacenamiento local.
- El estilo queda guardado con el raster, incluyendo parámetros de luz e inversión.

## Nuevo transporte Cloud en fragmentos

- Cualquier foto, imagen o geometría que supere 8 MiB se sube en partes inmutables de **máximo 8 MiB por objeto**; los archivos menores usan la ruta histórica.
- El manifiesto de `project_snapshots.state.assetMetadata` guarda tanto el primer archivo de cada recurso como la lista `cloud*Parts` de todas las partes, su tamaño original y su fingerprint.
- Las partes ya confirmadas de una subida interrumpida solo se reutilizan si Storage verifica que el objeto existe con la longitud correcta.
- No se publica un snapshot que referencie un fichero incompleto.
- La restauración descarga las partes en orden, reconstruye el `Blob` con su tipo original, comprueba su tamaño y su fingerprint SHA-256 antes de realizar el commit local atómico.
- La limpieza de archivos obsoletos también tiene en cuenta las rutas de *todas* las partes.
- Sin cambios en tablas, funciones SQL, políticas RLS ni bucket. Las rutas mantienen `<uid>/<project>/...` y se protegen con las políticas existentes.

### Compatibilidad

**Cualquier otro dispositivo que vaya a sincronizar el mismo proyecto debe actualizarse a la versión r28 con soporte de partes antes de abrir una copia cloud con un MDT fragmentado.** Versiones antiguas solo conocerían el primer segmento y rechazarían el fichero por tamaño incorrecto. No desinstales la PWA ni borres IndexedDB/localStorage: ambos contienen copias locales que hay que preservar.

Los límites propios del proyecto o bucket siguen aplicándose: si Supabase se configura para rechazar objetos de incluso 8 MiB, se deberá reducir `CLOUD_ASSET_PART_SIZE` o elevar su límite desde el panel Storage.

## Pruebas

Hay regresiones automáticas en `tests/raster-hillshade-chunk-sync.test.cjs` para sombreado e inversión, transferencia de un GeoTIFF simulado de 51 MiB, recuperación del contenido concatenado y reanudación de subida. **Una prueba automática en Node no reemplaza una prueba real de Supabase ni la subida y restauración del MDT real**. Probar con dos dispositivos antes de publicar en `main`.
