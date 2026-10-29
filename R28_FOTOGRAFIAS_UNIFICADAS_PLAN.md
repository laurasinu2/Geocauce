# R28 · Fotografías unificadas e importación georreferenciada

Rama de desarrollo: `feature/r28-fotografias-unificadas-20261029`.
Base protegida: `backup/r28-copia-20261027`.

## Auditoría inicial del modelo existente

- Las fotos ya se guardan como registros con `blob` en IndexedDB, store `photos`.
- `app.js`: `photoChosen` registra fotos de campo con `featureId`, `campaignId`, `gnss` y eventualmente puntos en `mapPins`.
- `historicalPhotoChosen` usa el mismo store `photos`, añade `historicalPointId` y mantiene la asociación en `historicalPhotoPoints[].photos`.
- `dbPut('photos',record)` participa en la cola cloud mediante `cloudQueueAssetChange`, por lo que no hay que crear otra vía de subida.
- El esquema del proyecto y los estados de campaña se guardan aparte de los blobs.
- La PWA móvil consulta `historicalPhotoPoints`; el sistema de mapa representa por separado puntos fotográficos y pins de fotos normales.

## Primer paso implementado

Se añade `photo-unified-core.js`, una capa funcional no destructiva que construye una vista común de un registro legado de foto, su ubicación, campaña, punto y asociaciones, sin reescribir los datos. Incluye lector EXIF TIFF/JPEG limitado y seguro para las coordenadas GPS, rumbo de captura y fecha original, más utilidades CSV y GeoJSON.

Este módulo aún no reemplaza los flujos de producción ni cambia el esquema existente. No borrar `mapPins`, `historicalPhotoPoints`, `photos`, IDs ni relaciones antes de completar migración idempotente y pruebas reales de sincronización.

## Decisiones de diseño

1. La fotografía es una entidad común y la fecha es un atributo documental; no hay subtipos histórica / actual.
2. Los puntos fotográficos son entidades geográficas, potencialmente compartidas por varias imágenes.
3. Las series temporales deben ser asociaciones explícitas; la proximidad geográfica no implica pertenencia.
4. Sin GPS se conserva el registro sin colocarlo en el mapa; no se asigna ubicación del teléfono ni de fotos cercanas.
5. La asociación a parada no cambia las coordenadas de origen.
6. El original permanece en IndexedDB y posteriormente en Storage con la misma ruta incremental; las miniaturas son derivados.
7. Los permisos, campañas y papel viewer/editor/owner deben respetar la misma comprobación que el resto de GeoCauce.
8. Una migración completa debe ser reversible e idempotente, probar proyectos antiguos y mantener el funcionamiento del exportador.

## Pendiente antes de activar un importador de producción

- Auditar rutas de `native-adapter.js` y cloud para metadatos extendidos y binarios.
- Verificar que la extracción EXIF funciona con fotos reales de Android/cámara y HEIC (cuando sea compatible).
- Construir mapa de previsualización sobre el motor existente, no un segundo motor.
- Importación de lotes con validación, huellas SHA-256, reintentos y escrituras de IndexedDB verificadas.
- Relación de series, galería unificada, cono visual, campos documentales y comparador.
- Compatibilidad de campañas, punto único o compartido y sincronización cross-device.
- Ejecutar pruebas Node y pruebas reales en tablet/móvil con una copia completa del proyecto.

## Seguridad

**No aplicar SQL en Supabase de producción.** No hace falta SQL para el módulo funcional inicial. No borrar caché, IndexedDB ni datos de la PWA utilizada en campo.
