# R29 · Sistema fotográfico unificado e importador de campo

Versión activa: `r29-20261029` (PWA). Fecha de creación: 29/10/2026.
Copia de referencia protegida: `backup/r28-copia-20261027`.
No se ha modificado `main`, la copia funcional R28 ni ningún dato de producción en Supabase.

## Arquitectura y compatibilidad

- `photo-unified-core.js`: lector JPEG EXIF (GPS por archivo, altitud, fecha/hora, rumbo, orientación y dimensiones), adaptador que no muta datos antiguos, CSV y GeoJSON.
- `photo-workspace.js`: importador por lotes y galería unificada. Los originales se guardan en el store IndexedDB `photos`. La vista previa no guarda registros antes de confirmar.
- `photo-workspace.css`: interfaz de dos paneles en tablet y diseño vertical en móvil.
- `app.js`: conexión con proyecto, campañas, permisos, conversión CRS, puntos fotográficos y cola de sincronización actual.
- `mobile-pwa.js`: accesos a importación y galería en el modo móvil.
- `sw.js`: archivos JS/CSS añadidos al caché offline.

## Funcionalidad realizada en R29

- Selección de múltiples JPEG simultáneos, lectura progresiva EXIF, validación, SHA-256 y miniaturas derivadas.
- Localización previa de todas las fotos con GPS; agrupación visual de marcadores cercanos sin fusionar registros.
- Corrección manual de coordenadas o asignación sobre mapa; las posiciones manuales quedan identificadas como tales.
- Caso de prueba opcional para `IMG_5212.jpeg` (1a: 41.60515 N, 1.81454 E), `IMG_5188.jpeg` (2: 41.60627 N, 1.81422 E) y `IMG_5160.jpeg` (3a: 41.60840 N, 1.81452 E). Nunca se presentan como GPS EXIF.
- Procesamiento por lotes, cancelación durante la lectura, paginación de 100 elementos, progreso de guardado y reintento de fallos.
- Guardado local idempotente: las fotos importadas reciben ID estable derivado de su SHA-256; los puntos reciben ID estable derivado del hash del archivo de puntos y de la fila.
- Recuperación de relación fotografía/punto cuando un fallo se produce después de guardar el binario.
- CSV, GeoJSON, GPX y KML con transformación desde EPSG:4326, 25830 o 25831, conservando atributos de origen.
- Visor grande, galería con filtros por ubicación, metadatos documentales, coordenadas, dirección y cono visual aproximado.
- Series por etiquetas explícitas, fotografía de referencia y comparador deslizador/opacidad/paralelo.
- Herramienta de mapa y nomenclatura visibles unificadas bajo «Fotografía». Los IDs y estructuras legacy no se borran.
- Protección adicional: no se borra un punto con fotografías para evitar pérdida accidental de archivos; el archivo original nunca se recomprime.

## Estado y límites actuales

Esta versión es **de desarrollo**. Se han ejecutado pruebas automatizadas con imágenes EXIF sintéticas y datos geográficos; no se ha realizado todavía validación táctil ni de sincronización real entre móvil y tablet Android.

- La vista previa reutiliza los rasters en memoria, pero no todo el renderizador cartográfico del mapa principal (por ejemplo, algunas capas vectoriales).
- HEIC/HEIF no se importa por ahora. El soporte principal es JPEG.
- Las series temporales usan una asociación explícita por nombre; aún no disponen de catálogo propio de series con IDs y edición avanzada.
- No se elimina el legado de IndexedDB ni se migra masivamente; se mantiene un adaptador de compatibilidad.
- Los borrados de fotografías con relaciones permanecen restringidos por seguridad. Falta una interfaz específica de desvinculación/migración antes de habilitarlos.
- Las pruebas con fotografías verdaderamente geolocalizadas en Android, restauración y sincronización cruzada son pendientes, no deben declararse superadas.
- No se ha desplegado ni validado un entorno PWA público separado para esta rama. Revisar el método de previsualización antes de utilizar datos de producción.

## Procedimiento de pruebas manuales recomendado

1. En la PWA de R29, crear un proyecto **de prueba**, sin sincronización cloud activa.
2. Abrir «Mapas y capas» → «Importar puntos / fotografías».
3. Seleccionar las tres imágenes JPEG anteriores. Deben aparecer «Sin GPS»; usar **«Asignar puntos 1a · 2 · 3a»** solo si se comprueba el orden y los nombres.
4. Confirmar y comprobar los tres puntos en el mapa y sus fotografías en la galería unificada.
5. Importar el mismo lote de nuevo; debe notificar los repetidos sin crear copias.
6. Importar fotos sintéticas con GPS, CSV/UTM31, GPX y GeoJSON. Confirmar que ninguna coordenada se transfiere a otra foto.
7. Simular modo avión, importar otro lote y comprobar almacenamiento local tras reiniciar la PWA.
8. Tras realizar una copia de seguridad, probar sincronización cruzada en proyectos de prueba y comprobar ID, blobs y relaciones en ambos dispositivos.
9. Probar con tablet horizontal, tablet vertical y móvil (pantallas y gestos), así como restauración/exportación de proyectos.

## Supabase

**No es necesario ejecutar SQL para los cambios actuales.** Las fotografías continúan en los assets del proyecto y sus metadatos se guardan dentro del manifiesto de snapshots existente. No se ha ejecutado migración alguna. Si se define posteriormente un catálogo relacional independiente de series, se documentará antes una migración SQL para revisión.

## Convención de ramas

Cada rama nueva equivale a una versión nueva: `rNN-AAAAMMDD`. No crear ramas `feature/*` o `backup/*` nuevas. La rama `backup/r28-copia-20261027` es una referencia histórica protegida; no modificarla.

## R29: traslado de elementos sobre el mapa

La edición de ubicación es explícita, reversible mediante las posiciones anteriores almacenadas y distinta de desplazar el mapa.

**Flujo:** abrir un elemento → «Mover» → tocar la nueva posición → confirmar. Alternativamente usar «Mover elemento a otro punto» en el menú de herramientas, tocar el elemento de origen y después su destino. Si coinciden varios elementos, se muestra una selección de objetivos. Se puede cancelar con «Cancelar» o Escape. En móviles y tablets, el gesto de dos dedos sigue desplazando/ampliando el mapa sin aceptar por accidente una posición.

Elementos admitidos:
- Fotografías individuales, separándolas de un punto compartido cuando sea necesario
- Puntos fotográficos, actualizando la posición vigente de todas las imágenes agrupadas
- Paradas, puntos GPS importados, notas rápidas y posiciones de páginas de libreta
- Secciones, canales, depósitos, límites y otros polígonos
- Cauces y tramos, conservando la coherencia de los tramos y las secciones vinculadas
- Anotaciones dibujadas sobre el mapa

Al trasladar se conserva el identificador, el contenido binario, los atributos, los vínculos documentales y la ubicación anterior. El origen de la **ubicación actual** queda registrado como `manual-map`; las coordenadas originales EXIF o GNSS se mantienen por separado. Los perfiles automáticos afectados se conservan como datos anteriores y se marca su necesidad de recálculo.

Los mapas raster y las capas vectoriales de referencia no se trasladan mediante esta herramienta porque tienen georreferenciación de origen, que requiere una operación explícita y separada de edición de georreferencia.

No se requiere migración SQL ni actualización de tablas Supabase para este traslado. Las nuevas propiedades viajan con los metadatos del proyecto y los registros fotográficos existentes. Falta comprobar gestos e importación en una PWA Android real antes de usarlo en datos de campo irreemplazables.
