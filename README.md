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
