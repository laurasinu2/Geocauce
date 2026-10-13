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
