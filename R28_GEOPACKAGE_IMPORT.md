# GeoCauce r28 · Importar archivos GeoPackage (.gpkg)

## Uso
1. Abre el panel **Capas**.
2. Pulsa **Importar mapa** o **Importar SHP / ZIP / GeoPackage**.
3. Selecciona un archivo `.gpkg`. No es necesario descomprimirlo ni exportar las capas vectoriales por separado.
4. GeoCauce revisa las tablas `gpkg_contents`, `gpkg_geometry_columns` y, si hay mapas de teselas, `gpkg_tile_matrix_set` / `gpkg_tile_matrix`.
5. La cola indica cuántas capas vectoriales y cuántos mapas ha preparado. Pulsa **Cargar** para incorporarlos al proyecto.

Los dos botones utilizan el mismo lector: si un GPKG tiene **líneas, polígonos y mapas** se muestran todas las capas compatibles, independientemente del botón utilizado.

## Qué se admite

- Puntos, líneas, polígonos y sus colecciones/multigeometrías en GeoPackageBinary/WKB; atributos que no sean blobs binarios y referencias espaciales.
- GeoPackage de mapas de teselas **PNG/JPEG** (u otro tipo de imagen compatible con `createImageBitmap`), con georreferenciación, escala y nivel de detalle registrados.
- Proyecto offline: el lector SQLite es código JavaScript incluido en la PWA, no utiliza ninguna API remota ni CDN.
- Copias cloud: las geometrías, atributos y vistas PNG preparadas siguen el sistema habitual de sincronización de GeoCauce r28. El GeoPackage original no se sube automáticamente como fuente raster.

## Límites deliberados

- No lee cobertura altimétrica `2d-gridded-coverage` (p. ej. teselas TIFF Float32 de elevación). Exporta esa tabla desde QGIS como **GeoTIFF** si quieres aplicar Hillshade y analizar elevaciones.
- Los mapas ráster de teselas requieren el mismo EPSG que el proyecto (con compatibilidad UTM 32630↔25830 / 32631↔25831). Si vienen como **EPSG:3857 u otra proyección**, deben reproyectarse en QGIS antes de cargarlos; nunca se sitúan con una transformación aproximada. Para vectores EPSG:3857, 4326 y 4258 sí puede convertir coordenadas a un proyecto compatible.
- Los mapas de teselas muy grandes se preparan como imagen de visualización de hasta 4096 píxeles por lado y 16 millones de píxeles. Si se reduce la resolución se muestra una advertencia; usa GeoTIFF para los detalles raster originales. El archivo fuente sigue siendo responsabilidad del usuario.
- Las geometrías de fuentes con EPSG desconocido no se colocan suponiendo el CRS del proyecto.
- Ciertas variantes de SQLite poco comunes (tablas WITHOUT ROWID y archivos SQLite codificados como UTF-16) todavía no están incluidas. La importación mostrará un error descriptivo si encuentra un formato incompatible.

## Seguridad de datos y despliegue
Esta función no ejecuta SQL en Supabase, no cambia las tablas de colaboración ni elimina SHP o GeoTIFF antiguos. Mantén copias de seguridad de los proyectos; no desinstales ni borres la PWA para actualizarla. Es necesario que la versión r28 esté presente en todos los dispositivos que importan o sincronizan.

## Pruebas
`tests/geopackage-import.test.cjs` genera una base SQLite auténtica, verifica metadatos de GeoPackage, lectura de 260 geometrías, celdas con overflow, preservación WKB y PNG, y que un archivo mixto produzca capas vectoriales y un mapa georreferenciado. Esto no sustituye la validación con GeoPackages reales de distintos proveedores y tamaños.
