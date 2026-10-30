## R30 · corrección de perfiles MDE/LiDAR (30/10/2026)

- Se recalculan perfiles de secciones, tramos y cauces cuando un cálculo anterior carece de elevaciones válidas; no se reutilizan resultados vacíos como si fueran correctos.
- El muestreo descarta fuentes GeoTIFF originales ausentes y devuelve un error explícito si ninguna fuente está disponible.
- La caché de secciones tiene en cuenta la geometría y el tamaño del raster original; la de perfiles longitudinales y estadísticas también comprueba la disponibilidad del original.
- Se conserva la edición manual de perfiles y las correcciones existentes. No requiere migraciones SQL ni cambios en Supabase.
- Pendiente de prueba funcional con archivos GeoTIFF reales en PWA móvil/tablet.

# Convención de versiones y ramas de GeoCauce

**Norma de desarrollo desde el 29/10/2026:** cada rama nueva representa una versión nueva y su nombre debe incluir **solamente el número de revisión y la fecha de creación**, con el formato `rNN-AAAAMMDD`, por ejemplo `r29-20261029`, `r30-20261030`. No utilizar prefijos `feature/`, `backup/` ni sufijos descriptivos en las ramas nuevas. Incrementar `NN` en cada rama creada, aunque el trabajo sea una continuación de la versión anterior. Consultar las ramas existentes antes de asignar el siguiente número.

La rama histórica `backup/r28-copia-20261027` permanece como referencia funcional sin modificar. La rama `r29-20261029` se creó desde el trabajo inicial de fotografías unificadas y es el desarrollo activo. Mantener `main` intacta salvo petición expresa. Los nombres anteriores se conservan por compatibilidad histórica; esta norma se aplica a las nuevas ramas.

**Plataforma principal de desarrollo y pruebas:** PWA (navegador e instalación como aplicación, principalmente Android). No exigir una app nativa ni conexión a Supabase para las funciones locales. Reutilizar IndexedDB, el almacenamiento binario y la cola incremental de sincronización existentes. Los datos de prueba sintéticos son suficientes para desarrollar e iniciar pruebas; fotografías reales y copias de proyectos son opcionales para validar compatibilidad con cámaras y proyectos concretos, no requisitos para empezar.

---
### R29 · Mover cualquier elemento cartográfico creado

En la versión `r29-20261029`, la herramienta **Mover elemento a otro punto** permite seleccionar un marcador, fotografía, punto fotográfico, parada, punto GPS importado, nota georreferenciada, anotación dibujada, sección, tramo, cauce o polígono; tocar un nuevo lugar del mapa y confirmar el anclaje. La posición y las coordenadas almacenadas se actualizan sin alterar los archivos originales. También hay botones **Mover** en fichas de fotos, paradas y geometrías.

Los puntos y fotografías con ubicación original GNSS conservan ese origen documental, aunque la ubicación vigente pase a ser **manual-map**. Mover una fotografía individual no arrastra las otras de su punto; mover un punto fotográfico con varias fotos mueve todo el grupo. Mover una parada no arrastra fotografías vinculadas. Mover un tramo desplaza con él su cauce y secciones relacionadas, sin deformar su geometría. Se requiere permiso de edición de la campaña y confirmación antes de guardar.

**Límites:** no modifica la georreferenciación de mapas GeoTIFF ni la geometría original de capas SHP de referencia; estas capas externas no son anotaciones creadas por el usuario. La comprobación física en PWA Android sigue pendiente. No exige SQL ni migraciones en Supabase.


## R29 · Fotos unificadas e importador georreferenciado (29/10/2026)

La rama `r29-20261029` incorpora un importador PWA de fotografías JPEG por lotes, lectura EXIF por archivo, previsualización en mapa, puntos CSV/GPX/KML/GeoJSON, SHA-256, galería unificada, correcciones manuales y recuperación frente a fallos. Conserva IndexedDB y el sistema de sincronización incremental existente; no necesita SQL en Supabase para estos cambios. Es una versión de desarrollo pendiente de validación táctil y sincronización real entre dispositivos. Detalles y protocolo de pruebas: [Plan R29](R28_FOTOGRAFIAS_UNIFICADAS_PLAN.md).

## v0.16.38 · punts fotogràfics històrics i selecció SHP directa

Punts fotogràfics amb sèrie temporal i control de visibilitat, més selecció successiva de geometries SHP directament sobre el mapa.

# GeoCauce web assets v0.16.38
## v0.16.32 · anotacions de mapa i zoom de seccions
- Capa independent d’anotacions lliures sobre el mapa, amb paleta, color personalitzat, gruix, goma i desfer.
- Zoom tàctil horitzontal de les seccions amb escala visible dinàmica i botó de vista completa.
- Referències de conques, cursos/canals i SHP sobre la secció amb punts del color cartogràfic; les etiquetes apareixen en fer zoom i mantenen mida de pantalla.


## v0.16.30 · SHP lleuger

Capes SHP grans amb render transparent precalculat, descàrrega de RAM en ocultar-les i conversió de cursos mitjançant ruta per múltiples punts connectats.


## v0.16.30 · editor MDT / GeoTIFF
- Pseudocolor real, classificació (continu, interval igual, quantil), intervals editables i rampes visuals.
- El render final continua pre-generant teseles per no recalcular simbologia mentre es navega.

## v0.16.28
- Simbologia vectorial SHP avançada amb editor de línia, polígon i punt.
- Color avançat: HEX, RGB, HSV, opacitat i paleta.
- Amplada, unitats, desplaçament, patró de línia, caps/unions, relleno i forma de punts.
- Estil persistent i respectat a l'exportació.
- Manté les correccions de modal raster, FITXA III manuscrita i perfils ×1 de la versió anterior.


## v0.16.25 · QA
- S Pen hover/imant corregit a FITXA III.
- Goma parcial corregida.
- FIC de FITXA III sense valors implícits.
- Exportació FITXA III en Esquema, Taula de camp i FIC.
- CRS dinàmic a FITXA I.

## v0.16.19 · correccions FITXA II
- Restabliment MDE per tram corregit.
- FITXA II reduïda a dues pàgines: perfil + FIC.
- Selectors FIC compatibles amb toc de dit.

# GeoCauce web assets v0.16.18

## Color de capes vectorials
- Selector de color abans d'importar SHP/ZIP.
- Color independent i editable després d'importar.
- El color es conserva al projecte i s'utilitza també a l'exportació.


Aquesta versió afegeix ordenació espacial dels fragments desconnectats al perfil longitudinal, representació del buit cartogràfic amb distància aproximada, redefinició de trams per superposició i moviment de límits compartits. Les etiquetes de tram es dibuixen al centre longitudinal real.

V0.11 consolida la PWA antes de cerrar las fichas geológicas y el modelo definitivo de base de datos.

## Novedades

- Nuevo logo de GeoCauce en la portada y nuevos iconos PWA basados en la marca facilitada.
- Pulido visual general: tamaños máximos coherentes para iconos, botones y textos; menos desbordamientos en tablet; controles de sección más compactos.
- **Copia completa de proyecto** en un único archivo `.geocauce` desde `Proyecto > Guardar copia completa`.
  - Incluye metadatos, campañas, geometrías, libreta, secciones, mapas guardados y fotografías.
  - Los mapas/fotos se guardan como blobs binarios, sin convertirlos a base64.
- **Importar proyecto** desde `Mis proyectos` o desde el panel del proyecto.
- **Galería de fotografías por elemento**: ver fotos, fecha, precisión GNSS/dirección cuando está disponible, añadir y eliminar.
- Fotografías nuevas guardan campaña y una instantánea de la posición GNSS disponible en ese momento.
- **GNSS mejorado**: precisión, UTM, lat/lon, altitud disponible, hora y dirección cuando el navegador la proporciona. El badge cambia según calidad aproximada.
- **Buscador** de IDs, materiales, canales, secciones y páginas de libreta.
- **Leyenda automática** basada en los materiales realmente utilizados en la campaña actual.
- Se conserva todo lo anterior: proyectos, campañas inmutables, libreta, GeoTIFF, edición de contornos, secciones rectas e inteligentes, etc.

## Sobre SQLite

La PWA sigue usando `localStorage + IndexedDB` porque funciona directamente en navegador y permite iterar muy rápido. Para la APK está previsto migrar el modelo definitivo a **SQLite** (idealmente una capa nativa/Room o equivalente) una vez cerremos las fichas, las operaciones geométricas y el esquema `Project > Campaign > Feature > FeatureVersion`. Los GeoTIFF y fotografías grandes seguirán como archivos; SQLite guardará metadatos, relaciones, geometrías y rutas, evitando inflar la base de datos.

## Ejecutar

```bash
python -m http.server 8080
```

Después abre `http://localhost:8080`.

## PWA / caché

La caché de esta versión es `geocauce-v0.16.18`. Si aparece una interfaz anterior, realiza una recarga forzada o elimina una vez los datos del sitio.

## Nota sobre GNSS

La API web estándar no entrega número de satélites ni observaciones GNSS crudas. GeoCauce V0.11 muestra solo datos reales que el navegador expone. En la futura APK se podrá acceder a Android GNSS para añadir satélites/calidad avanzada y receptores externos.

## v0.16.8 · correcciones de tablet

- Exportación FITXA I por bloques hacia el bridge nativo.
- Targeta universal más compacta y arrastrable.
- Conca seleccionable solo sobre el contorno.
- Tipografía de interfaz sans-serif.
- Snapshot cloud con metadatos de assets y preferencias, sin binarios de fotos/GeoTIFF.


## v0.16.8 · importació SHP des de ZIP

- El selector de capes vectorials accepta ara `.zip` directament.
- El ZIP pot contenir el SHP a l’arrel o dins d’una carpeta.
- GeoCauce detecta automàticament els fitxers companys `.shp`, `.dbf`, `.shx`, `.prj`, `.cpg` i `.qmd`.
- Provada l’estructura esperada amb `Drenatges.zip` i `conques hidro.zip`; tots dos utilitzen ETRS89 / UTM 31N i el segon porta els fitxers dins d’una subcarpeta.
- Continua sent possible seleccionar els fitxers SHP solts si es prefereix.

## v0.16.36 · parades i punts històrics
- Eliminació de punts de parada i punts fotogràfics històrics.
- Vinculació magnètica d’un punt històric a una parada tocant-la al mapa.
- La vinculació encaixa el punt històric exactament sobre la parada i queda persistent al projecte.
