# r28 · Estado manual de la FITXA III (secciones)

GeoCauce guarda el estado de cada sección dentro de su objeto `sheetIII`,
como la propiedad `workStatus`. Valores aceptados:
- `pending`: **Sin hacer** (rojo)
- `started`: **Comenzada** (amarillo)
- `done`: **Acabada** (verde)
- `null` / ausente: **Por revisar** (gris, para fichas antiguas)

Las **secciones nuevas** empiezan como `pending`. Las fichas anteriores sin
estado se mantienen **sin clasificar**, sin inferir su grado de elaboración a
partir de lo escrito o dibujado. El cambio de estado es explícito y manual.

Ubicaciones de la interfaz: selector en la primera página de FITXA III, indicador
independiente de la geometría y del color científico junto a la etiqueta de cada
sección en el mapa, indicador y barra de resumen en el listado de secciones.

El usuario en modo solo lectura no puede cambiar el estado. El selector respeta
la regla de editabilidad de la campaña ya existente.

## Supabase: no se necesita ejecutar ningún SQL

`public.project_snapshots.state` ya es JSONB e incluye los datos de las fichas.
`workStatus` se conserva con el resto de `sheetIII` en la sincronización
existente. La modificación **no** requiere columnas, tablas, índices, funciones,
RLS ni nuevas claves de Storage. No ejecutar `SUPABASE_SETUP.sql` para esto.

La advertencia previa de Supabase sobre tablas sin RLS **es otro problema** y no
se corrige con esta función. La migración general de compartir proyectos en r28
también es independiente y debe validarse antes de aplicarla.

## Pruebas

`tests/section-work-status.test.cjs`: validación, compatibilidad, fichas
antiguas, persistencia por sección, lectura de campañas anteriores y dibujo.
Los tests Node no sustituyen una prueba visual en tablet ni una restauración
real desde Supabase; probar ambos antes de fusionar r28 en `main`.
