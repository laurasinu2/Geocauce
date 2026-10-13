# GeoCauce PWA móvil · v0.16.39 alpha

Esta integración conserva la lógica y configuración de Supabase de GeoCauce v0.16.39 y añade la interfaz móvil/PWA.

## Prueba rápida

Servir esta carpeta por HTTPS (o localhost). En cualquier navegador puede forzarse la interfaz móvil con `?previewMobile=1`.

En iPhone/iPad: abrir en Safari y usar **Añadir a pantalla de inicio** para ejecutarla como web app independiente.

## Modos de interfaz

En Configuración > Interfaz móvil: Automático, Simplificada o Completa.

## Nota

La integración no reemplaza `supabase-config.js` ni la lógica cloud de `app.js` de v0.16.39. Los cambios móviles se superponen sobre esa base.

## Sincronización Supabase

La PWA se conecta a `public.projects` y `public.project_snapshots`, según `SUPABASE_SETUP.sql`. Asegúrate de ejecutar ese archivo en **Supabase > SQL Editor**; iniciar sesión no crea las tablas automáticamente.

Al iniciar sesión se obtiene el catálogo. Los datos completos se suben cuando se abre el proyecto y se guardan sus cambios, o al pulsar **Sincronizar ahora**. Si no hay uno abierto, ese botón abre el último proyecto seleccionado. Si aparece **Pendiente: ...**, revisa el error en **Cuenta** y las políticas RLS y el bucket privado `geocauce-files`.

No borres la PWA ni limpies sus datos antes de hacer una copia `.geocauce` del proyecto.

## Modales siempre visibles (corrección PWA)

Todas las ventanas `.modal` se colocan en una capa global fuera de pantallas con `z-index` propios. La ventana abierta más recientemente queda encima de las anteriores, también sobre Configuración y la interfaz móvil. Los paneles móviles de observación y carga comparten esa capa. El botón Cuenta de Proyectos y el perfil móvil abren directamente la gestión de cuenta. Cache de recursos PWA: r5.

## Recuperación de Safari con versión antigua (nube r6)

Si aparece un error RLS que menciona la tabla **singular** `project`, Safari está ejecutando código antiguo: la app actual usa `projects`. Primero entra en Configuración > Almacenamiento en la nube y pulsa **Actualizar aplicación**. El botón actualiza el service worker y recarga la interfaz con una URL nueva para evitar caché antigua, sin borrar almacenamiento local. La versión muestra la etiqueta **Versión nube r6**.

Es imprescindible que hayas ejecutado `SUPABASE_SETUP.sql` en el SQL Editor del proyecto Supabase correcto. Este script crea y protege `public.projects` y `public.project_snapshots` sin borrar las tablas anteriores. **No** elimines `project`, cuentas ni datos antiguos hasta que hayas exportado una copia y confirmado la sincronización correcta.
