# R49 · Adminer privado para PostgreSQL

Adminer está declarado en `compose.yaml` como servicio separado. Solo publica el puerto
`127.0.0.1:8081` del **VPS**, no la IP pública; no hay ruta en Caddy.
No expongas Adminer en `0.0.0.0` ni en un dominio público.

## Credenciales actuales

La base del Compose es `geocauce`. El nombre de usuario PostgreSQL se configura
mediante `POSTGRES_USER` y la contraseña mediante `POSTGRES_PASSWORD` en
`/opt/geocauce/.env`. El workflow recibe sus valores desde los **GitHub
repository secrets** `DB_USERNAME` y `DB_PASSWORD` por SSH verificado.
En una instalación existente, ambos secretos **deben coincidir con el usuario
y contraseña ya inicializados**: el despliegue se detiene sin cambiar la base
si son distintos. Para cambiar usuario o contraseña hace falta una rotación
planificada por separado. El antiguo nombre de usuario por defecto es
`geocauce`.
No confundas estas credenciales con la contraseña SSH, Supabase ni el inicio
de sesión de la PWA.

Para inspeccionar el nombre de la variable sin revelar su valor:
```bash
test -f /opt/geocauce/db-password && echo 'El archivo privado de contraseña existe'
```
Para leer el secreto, abre el archivo de manera privada en el VPS; no
lo pegues en terminales compartidas, capturas, issues o GitHub.

## Arranque seguro en el VPS

No uses `down`, `down -v`, `volume rm` ni cambies contraseñas.
La actualización habitual de R49 se realiza desde GitHub Actions y usa
`/opt/geocauce/.env`. Tras un despliegue aprobado, verificar:

```bash
docker ps --filter name=geocauce-adminer
sudo ss -ltnp | grep ':8081'
```

Si deseas iniciar solo el servicio desde la instalación actual, utiliza
`docker compose --env-file /opt/geocauce/.env -f /opt/geocauce/current/compose.yaml up -d --no-deps adminer`
**solo después** de que `current` apunte a una versión con Adminer.
No ejecutes Compose desde una copia vieja ni desde el directorio equivocado.

## Acceso desde Windows mediante túnel SSH

En PowerShell local, mantén abierta esta conexión:

```powershell
ssh -L 8081:127.0.0.1:8081 USUARIO_SSH@IP_DEL_VPS
```

Abre **http://127.0.0.1:8081** en el navegador de Windows.
En el formulario de Adminer:
- **System:** PostgreSQL
- **Server:** `db` (hostname dentro de la red Docker)
- **Username:** valor de `POSTGRES_USER` en `/opt/geocauce/.env`
- **Password:** valor del secret de GitHub `DB_PASSWORD` (sin compartirlo)
- **Database:** `geocauce`

Adminer no tiene una contraseña de administrador independiente en esta
configuración: comprueba las credenciales de PostgreSQL. Al conectarte como
`geocauce`, tendrás privilegios sobre los datos de la aplicación. Evita
`DROP`, `TRUNCATE`, `DELETE` o importaciones sobre la base de producción.
Cierra la sesión de Adminer y el túnel SSH al terminar.

## Migraciones desde Supabase

**No importes `geocauce_backup.dump` directamente desde Adminer en
`geocauce`.** Supabase usa esquemas internos, Auth y Storage, y el esquema
legado `public.project` no coincide con las tablas del backend actual.
Para pruebas, restaura en una base aislada y prepara una conversión
de datos, usuarios y archivos binarios. Un dump SQL NO incluye los
binarios de Storage. Realiza backup antes de cualquier importación.

## Verificación

```bash
curl -I http://127.0.0.1:8081/
```

Un HTTP 200/302/303 desde el VPS indica que el servicio responde;
el túnel y el login deben comprobarse por separado.
