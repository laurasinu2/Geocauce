# Configurar Supabase para GeoCauce v0.16.38

La app funciona **sin Supabase**. SQLite y los archivos locales siguen siendo la fuente principal. Supabase solo añade cuenta y copia/sincronización cloud.

## 1. Crear el proyecto

1. Entra en Supabase y crea un proyecto nuevo.
2. En **Authentication > Providers > Email** deja habilitado Email/Password.
3. Para las primeras pruebas puedes decidir si quieres confirmación de correo. Si la confirmación está habilitada, al crear una cuenta GeoCauce te pedirá revisar el correo antes de poder iniciar sesión.

## 2. Crear tablas y RLS

1. Abre **SQL Editor**.
2. Copia todo el contenido de `SUPABASE_SETUP.sql`.
3. Pulsa **Run**.

El script crea `projects`, `project_snapshots`, activa RLS y configura un bucket privado `geocauce-files` preparado para una fase posterior.

## 3. Obtener URL y publishable key

En el Dashboard de Supabase abre la configuración/API del proyecto y copia:

- Project URL, por ejemplo `https://xxxx.supabase.co`
- Publishable key (o la clave pública/anon del proyecto si tu dashboard todavía usa esa nomenclatura)

**No uses jamás `service_role`, secret key ni JWT secret dentro de la app.**

## 4. Configurar GeoCauce

Edita:

`app/src/main/assets/www/supabase-config.js`

Y deja:

```js
window.GEOCAUCE_CLOUD_CONFIG = {
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  publishableKey: 'sb_publishable_...',
  enabled: true
};
```

Vuelve a ejecutar la app desde Android Studio.

## 5. Probar el flujo

1. En una instalación sin elección previa pulsa **Entrar**.
2. Crea una cuenta o inicia sesión.
3. Si prefieres, pulsa **Entrar sin conexión**. Esa decisión se recuerda y no se vuelve a pedir al iniciar.
4. Si empezaste offline, en **Mis proyectos** o en **Proyecto** pulsa la zona de Cuenta para iniciar sesión después.
5. Abre un proyecto y pulsa **Sincronizar**. La v0.16.38 sube el estado estructural a PostgreSQL y los archivos del proyecto al bucket privado `geocauce-files`.

## Alcance actual de la sincronización

En v0.16.38 se sincronizan:

- metadatos generales y catálogo de proyectos;
- campañas, geometrías GeoCauce, libreta, secciones, puntos históricos, paradas y tinta;
- paleta y preferencias incluidas en el snapshot;
- fotografías, incluidas las de puntos históricos;
- mapas/raster, incluyendo la copia de visualización y el GeoTIFF original cuando está disponible;
- capas SHP/vectoriales, guardando la geometría completa y el raster ligero precalculado cuando existe.

Al iniciar sesión en otro dispositivo, GeoCauce consulta los proyectos de la cuenta. Los proyectos que solo existen en Supabase aparecen en **Mis proyectos** y sus datos/archivos se descargan al abrirlos por primera vez.

Los archivos se guardan en el bucket privado `geocauce-files`, dentro de una carpeta cuyo primer nivel es el UID del usuario, por lo que las políticas RLS incluidas en `SUPABASE_SETUP.sql` siguen siendo necesarias. Los mapas muy grandes siguen sujetos al límite máximo de archivo configurado en tu proyecto de Supabase Storage.

## Regla local-first

- Guardar en SQLite/local ocurre primero.
- Si no hay Internet, GeoCauce sigue funcionando con normalidad.
- Al recuperar conexión y mientras la app esté abierta, intenta sincronizar automáticamente los cambios pendientes.
- Cerrar sesión no borra datos locales.
