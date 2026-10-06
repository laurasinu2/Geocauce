# GeoCauce PWA móvil · v0.16.36 alpha

Esta carpeta `www` puede publicarse directamente en un servidor HTTPS como PWA.

## Qué se ha añadido

- Interfaz móvil simplificada inspirada en las referencias entregadas: inicio, proyectos, fotografías históricas, campañas/capas y perfil.
- Mapa móvil reducido: proyecto, norte/escala, capas, localización y navegación inferior; las herramientas de escritorio quedan ocultas en este modo.
- Preferencia `Configuración > Interfaz móvil`: Automático, Simplificada o Completa.
- Soporte PWA/iOS mejorado: icono Apple, modo standalone, safe areas y orientación libre.
- Recurso `mobile-mountain.png` suministrado como fondo de cabecera.
- Supabase, IndexedDB y el resto de la lógica existente se conservan.

## iPhone / iPad

Publicar por HTTPS, abrir en Safari y usar Compartir > Añadir a pantalla de inicio. La PWA utiliza las mismas credenciales/configuración de Supabase que la versión base.

## Vista de comprobación

Añadir `?previewMobile=1` a la URL fuerza temporalmente la interfaz móvil para revisión visual, sin cambiar la preferencia guardada.
