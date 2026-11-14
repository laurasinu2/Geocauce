# R49 · Database credentials managed with GitHub repository secrets

## Configure GitHub (not Environment secrets)

Open **laurasinu2/Geocauce → Settings → Secrets and variables → Actions
→ Repository secrets → New repository secret**.

Create both:
- `DB_USERNAME`: PostgreSQL login name (lowercase letters, digits and
  underscores; must start with a letter or underscore). For existing R49
  installations this is normally **`geocauce`**.
- `DB_PASSWORD`: any non-empty single-line password, including Unicode,
  spaces, and special characters such as `@`, `#`, `# R49 · Database credentials managed with GitHub repository secrets

## Configure GitHub (not Environment secrets)

Open **laurasinu2/Geocauce → Settings → Secrets and variables → Actions
→ Repository secrets → New repository secret**.

Create both:
- `DB_USERNAME`: PostgreSQL login name (lowercase letters, digits and
  underscores; must start with a letter or underscore). For existing R49
  installations this is normally **`geocauce`**.
- , `:` and `/`.
  For the **existing** Geocauce database, **copy the exact current password** from the private
  `/opt/geocauce/.env` file on Contabo, without posting it online.

These are distinct from `CONTABO_USER` and `CONTABO_PASSWORD` (SSH
credentials) and `JWT_SECRET` (application tokens).

## How deploy works

- The manual R49 workflow validates both secrets and transfers them as a
  two-line temporary file over the pinned-host-key SSH connection, outside
  GitHub, release source archives, and container logs.
- On **first installation with no existing Docker database volume**, the
  deployment creates `/opt/geocauce/.env` with
  `POSTGRES_USER=DB_USERNAME` and a distinct randomly generated `JWT_SECRET`,
  and stores the DB password in `/opt/geocauce/db-password` (outside Git).
- On **an already-initialized database**, the deploy verifies that both
  credentials agree with existing values. It adds the missing
  `POSTGRES_USER` line to older `.env` files when safe.
- If the username differs on an existing database volume, deployment **always
  stops**: changing a role requires a separate role/privilege migration.
- If only the password differs, deployment **stops by default** (`KEEP`).
  The manual workflow now offers an explicit opt-in `ROTATE_EXISTING`:
  it validates the existing TCP login, backs up PostgreSQL and the binary
  volume, updates the existing PostgreSQL role password, writes the new
  private password file, checks authentication and deploys. On failure
  after rotation it attempts to restore the old password and previous
  containers. This is a potentially service-interrupting operation.
  PostgreSQL's initialization variables alone never rotate an existing role.
- The old `JWT_SECRET` is preserved. The remote credentials transfer file
  is removed after reading (and the workflow also attempts cleanup on error).
- The `geocauce` database name, project data, and Docker volumes are
  preserved. Backups are still required before any update.

## Docker Compose / Adminer

Compose reads `POSTGRES_USER` from the private VPS `.env` and bind-mounts
`/opt/geocauce/db-password` into PostgreSQL and FastAPI. SQLAlchemy constructs
its connection with `URL.create`, so special characters are safe. For existing
installations, the old `POSTGRES_PASSWORD` line in `.env` may remain for
rollback compatibility.
Adminer uses PostgreSQL authentication directly; enter:
- System: PostgreSQL
- Server: `db`
- Username: `POSTGRES_USER`
- Password: exact value of GitHub `DB_PASSWORD` / VPS `db-password` file
- Database: `geocauce`

Adminer is reachable only through the configured SSH tunnel on port 8081;
never make it public.

## If you actually want a different username or password

**Do not replace GitHub Secrets and run with the default KEEP option:** that
intentionally fails on a credential mismatch. If **only the password** changes,
you can use the explicit `ROTATE_EXISTING` option in the manual deployment,
with backup-first and rollback safeguards. The API might briefly lose
database access during the rotation.

For a **username change** or a manual password rotation, follow a separate
database migration plan:
1. Back up PostgreSQL and the binary-file volume, and verify backup recovery.
2. If changing the username, create a PostgreSQL role with the correct
   ownership, schema privileges, grants and extension access; verify it in a
   staging copy before changing the application.
3. If changing the password, coordinate `ALTER ROLE` with the API service
   configuration and make sure a rollback can restore the old password.
4. Change GitHub Secrets and the VPS private `.env` together only after
   the database login has been tested. Then redeploy and test login,
   synchronization, API and Adminer.

The R49 workflow **does not** change usernames or PostgreSQL role ownership.
It only rotates the existing role's password when explicitly requested with
`ROTATE_EXISTING`. Password rotation is not a substitute for a verified,
off-server backup and recovery drill.

## How to deploy with the new DB_PASSWORD

1. Keep `DB_USERNAME` equal to the *existing* PostgreSQL role, typically
   `geocauce`.
2. Set the **new** desired `DB_PASSWORD` in GitHub Repository Secrets.
3. Go to **Actions → Deploy Geocauce to Contabo (manual) → Run workflow**.
4. Choose branch `fix/r49-recovery-healthcheck-20261114`, set
   `confirm=DESPLEGAR` and `db_password_action=ROTATE_EXISTING`.
5. Review the logs for successful backup, password rotation, SQLAlchemy DB
   connection check and HTTPS smoke check. After success, use the new password
   to log in through Adminer.

The existing database data and UUIDs are not deleted. After successful
password rotation, the legacy `.env` may still contain the *old*
`POSTGRES_PASSWORD` value for rollback compatibility; the new Compose release
uses the private `db-password` file instead. Manually rolling back to old
releases that still use a URL-based database password would require reverting
the database password as well.

## How to verify without revealing secrets

On the VPS:

```bash
grep '^POSTGRES_USER=' /opt/geocauce/.env
test -f /opt/geocauce/db-password && echo 'Private password file exists'
docker compose --env-file /opt/geocauce/.env -f /opt/geocauce/current/compose.yaml ps
```

Never print the actual password in Actions logs, screenshots or issues.
