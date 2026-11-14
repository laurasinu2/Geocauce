# R49 · Database credentials managed with GitHub repository secrets

## Configure GitHub (not Environment secrets)

Open **laurasinu2/Geocauce → Settings → Secrets and variables → Actions
→ Repository secrets → New repository secret**.

Create both:
- `DB_USERNAME`: PostgreSQL login name (lowercase letters, digits and
  underscores; must start with a letter or underscore). For existing R49
  installations this is normally **`geocauce`**.
- `DB_PASSWORD`: exactly 64 hexadecimal characters. For a **new** database,
  generate once using `openssl rand -hex 32`. For the **existing** Geocauce
  database, **copy the exact current password** from the private
  `/opt/geocauce/.env` file on Contabo, without posting it online.

These are distinct from `CONTABO_USER` and `CONTABO_PASSWORD` (SSH
credentials) and `JWT_SECRET` (application tokens).

## How deploy works

- The manual R49 workflow validates both secrets and transfers them as a
  two-line temporary file over the pinned-host-key SSH connection, outside
  GitHub, release source archives, and container logs.
- On **first installation with no existing Docker database volume**, the
  deployment creates `/opt/geocauce/.env` with
  `POSTGRES_USER=DB_USERNAME`, `POSTGRES_PASSWORD=DB_PASSWORD`,
  and a distinct randomly generated `JWT_SECRET`.
- On **an already-initialized database**, the deploy verifies that both
  credentials agree with existing values. It adds the missing
  `POSTGRES_USER` line to older `.env` files when safe.
- If the user or password differs on an existing Docker database volume,
  it **stops before replacing running containers or restoring data**.
  PostgreSQL's `POSTGRES_USER`/`POSTGRES_PASSWORD` variables are
  initialization parameters, not a way to rotate an existing role.
- The old `JWT_SECRET` is preserved. The remote credentials transfer file
  is removed after reading (and the workflow also attempts cleanup on error).
- The `geocauce` database name, project data, and Docker volumes are
  preserved. Backups are still required before any update.

## Docker Compose / Adminer

Compose reads `POSTGRES_USER` and `POSTGRES_PASSWORD` from the private VPS
`.env` and uses them for PostgreSQL and the FastAPI `DATABASE_URL`.
Adminer uses PostgreSQL authentication directly; enter:
- System: PostgreSQL
- Server: `db`
- Username: `POSTGRES_USER`
- Password: `POSTGRES_PASSWORD`
- Database: `geocauce`

Adminer is reachable only through the configured SSH tunnel on port 8081;
never make it public.

## If you actually want a different username or password

**Do not simply replace the GitHub secret and deploy.** For an existing
volume you must plan the database-side change first:
1. Back up PostgreSQL and the binary-file volume, and verify backup recovery.
2. If changing the username, create a PostgreSQL role with the correct
   ownership, schema privileges, grants and extension access; verify it in a
   staging copy before changing the application.
3. If changing the password, coordinate `ALTER ROLE` with the API service
   configuration and make sure a rollback can restore the old password.
4. Change GitHub Secrets and the VPS private `.env` together only after
   the database login has been tested. Then redeploy and test login,
   synchronization, API and Adminer.

The current automated R49 workflow deliberately does **not** implement
live role replacement or password rotation.

## How to verify without revealing secrets

On the VPS:

```bash
grep '^POSTGRES_USER=' /opt/geocauce/.env
grep '^POSTGRES_PASSWORD=' /opt/geocauce/.env | cut -d= -f1
docker compose --env-file /opt/geocauce/.env -f /opt/geocauce/current/compose.yaml ps
```

Never print the actual password in Actions logs, screenshots or issues.
