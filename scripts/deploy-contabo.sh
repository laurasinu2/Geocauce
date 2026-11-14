#!/usr/bin/env bash
# Invoked over SSH by .github/workflows/deploy-contabo.yml.
# Persistent Docker volumes are never deleted; an existing .env is never replaced.
set -Eeuo pipefail
umask 077

ROOT=/opt/geocauce
SHA="${1:-}"
ARCHIVE="${2:-}"
DESIRED_SITE="${3:-}"
CREDENTIAL_FILE="${4:-}"
DB_PASSWORD_ACTION="${5:-KEEP}"
# One-time SSH-transferred file, outside Git and the release archive.
[[ "$CREDENTIAL_FILE" =~ ^/opt/geocauce/incoming/db-credentials-[0-9]+-[0-9]+-[0-9a-f]{12}\.txt$ ]] ||
  { echo "ERROR: Unexpected database credential path." >&2; exit 1; }
[[ -f "$CREDENTIAL_FILE" && ! -L "$CREDENTIAL_FILE" ]] ||
  { echo "ERROR: Database credentials missing on VPS." >&2; exit 1; }
chmod 600 "$CREDENTIAL_FILE"
DB_USERNAME="$(sed -n '1p' "$CREDENTIAL_FILE")"
DB_PASSWORD="$(sed -n '2p' "$CREDENTIAL_FILE")"
[[ "$DB_USERNAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] ||
  { rm -f "$CREDENTIAL_FILE"; echo "ERROR: Invalid DB_USERNAME." >&2; exit 1; }
# Accept non-empty passwords including punctuation, spaces and Unicode.
# The SSH transfer format is exactly two lines, so newline/CR is unsupported.
[[ -n "$DB_PASSWORD" ]] ||
  { rm -f "$CREDENTIAL_FILE"; echo "ERROR: DB_PASSWORD must be non-empty and single-line."; exit 1; }
rm -f "$CREDENTIAL_FILE"
unset CREDENTIAL_FILE
STARTED=0
PREVIOUS=""
ROTATE_PASSWORD=0
ROTATED_PASSWORD=0
OLD_DB_PASSWORD=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$DB_PASSWORD_ACTION" == "KEEP" || "$DB_PASSWORD_ACTION" == "ROTATE_EXISTING" ]] ||
  die "Unexpected database password action."

# Passwords are never supplied as SQL command arguments. PostgreSQL identifiers
# are restricted to a safe regex above; single quotes are escaped as SQL literals.
write_password_file() {
  local tmp
  tmp="$(mktemp "$ROOT/.db-password.XXXXXXXX")"
  printf '%s' "$1" > "$tmp"
  chmod 0444 "$tmp"  # API runs as UID 10001; /opt/geocauce is private on the host.
  mv -f "$tmp" "$ROOT/db-password"
}
change_pg_password() {
  local quoted
  quoted="${1//\'/\'\'}"
  # Suppress SQL on errors so a password is never echoed in deployment logs.
  printf "SET standard_conforming_strings = on;\nALTER ROLE \"%s\" PASSWORD '%s';\n" "$DB_USERNAME" "$quoted" |
    docker exec -i geocauce-db-1 psql -X -q -U "$DB_USERNAME" -d postgres -v ON_ERROR_STOP=1 >/dev/null 2>&1
}

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "Invalid commit SHA."
[[ "$ARCHIVE" =~ ^/opt/geocauce/incoming/geocauce-release-[0-9]+-[0-9]+-[0-9a-f]{12}\.tar\.gz$ ]] ||
  die "Unexpected upload path."
[[ -f "$ARCHIVE" ]] || die "Uploaded release archive not found."
[[ "$DESIRED_SITE" =~ ^[a-zA-Z0-9.-]+$ ]] ||
  die "A public DNS hostname is required as the third argument."
[[ "$DESIRED_SITE" != "localhost" && "$DESIRED_SITE" != "geocauce.example.org" ]] ||
  die "Configure a real, public DNS hostname before deployment."
[[ -d "$ROOT" && -w "$ROOT" ]] ||
  die "/opt/geocauce must exist and be writable by the SSH user."
command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null || die "Docker Compose v2 is required."
command -v flock >/dev/null || die "flock is required."
command -v curl >/dev/null || die "curl is required."

mkdir -p "$ROOT/releases" "$ROOT/backups"
chmod 700 "$ROOT/backups"
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || die "Another deployment is running."

# First installation only: generate secrets on the VPS without logging or
# transferring their values. Never regenerate credentials for existing volumes.
if [[ ! -e "$ROOT/.env" ]]; then
  if docker volume inspect geocauce_postgres_data >/dev/null 2>&1 ||
     docker volume inspect geocauce_files_data >/dev/null 2>&1; then
    die "There are existing Geocauce Docker volumes but no .env. Restore its credentials before retrying."
  fi
  command -v openssl >/dev/null || die "openssl is required for JWT_SECRET generation."
  env_tmp="$(mktemp "$ROOT/.env.XXXXXXXX")"
  {
    printf 'POSTGRES_USER=%s\n' "$DB_USERNAME"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'SITE_ADDRESS=%s\n' "$DESIRED_SITE"
    printf 'ALLOW_SIGNUP=false\n'
    printf 'MAX_UPLOAD_BYTES=16777216\n'
  } > "$env_tmp"
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$ROOT/.env"
  echo "Created private first-install configuration in /opt/geocauce/.env."
elif [[ ! -f "$ROOT/.env" ]]; then
  die "The /opt/geocauce/.env path exists but is not a regular file."
fi

# Existing secrets are immutable: an accidental changed site parameter must not
# silently rewrite the production configuration.
# Existing installations require an explicit credential reconciliation.
# Never silently change the PostgreSQL role or password of a live volume.
EXISTING_USER="$(sed -n 's/^POSTGRES_USER=//p' "$ROOT/.env" | tail -n1)"
EXISTING_USER="${EXISTING_USER:-geocauce}"
if [[ -f "$ROOT/db-password" ]]; then
  EXISTING_PASSWORD="$(cat "$ROOT/db-password")"
else
  EXISTING_PASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ROOT/.env" | tail -n1)"
fi
if docker volume inspect geocauce_postgres_data >/dev/null 2>&1; then
  [[ "$EXISTING_USER" == "$DB_USERNAME" ]] ||
    die "DB_USERNAME differs from the initialized PostgreSQL role. Refusing automatic role replacement. Keep the current user or plan a manual migration."
  if [[ "$EXISTING_PASSWORD" != "$DB_PASSWORD" ]]; then
    [[ "$DB_PASSWORD_ACTION" == "ROTATE_EXISTING" ]] ||
      die "DB_PASSWORD differs from the initialized PostgreSQL password. Select ROTATE_EXISTING in the manual workflow to back up and rotate it, or use the current database password."
    [[ -n "$EXISTING_PASSWORD" ]] ||
      die "Existing DB password is missing. Manual recovery required."
    ROTATE_PASSWORD=1
    OLD_DB_PASSWORD="$EXISTING_PASSWORD"
    echo "PostgreSQL password rotation requested. Backup and verification required before change."
  fi
fi
# Once verified, keep the password in a private bind-mounted file rather than
# injecting it into Compose interpolation or a URL. API runs as UID 10001.
if [[ -e "$ROOT/db-password" && ! -f "$ROOT/db-password" ]]; then
  die "Database password path is not a regular file."
fi
if [[ ! -e "$ROOT/db-password" && "$ROTATE_PASSWORD" -eq 0 ]]; then
  write_password_file "$DB_PASSWORD"
fi
# Safe for already-initialized environments when secrets match.
# Ensure older .env files gain POSTGRES_USER without changing their original password.
if ! grep -q '^POSTGRES_USER=' "$ROOT/.env"; then
  env_tmp="$(mktemp "$ROOT/.env.XXXXXXXX")"
  { cat "$ROOT/.env"; printf '\nPOSTGRES_USER=%s\n' "$DB_USERNAME"; } > "$env_tmp"
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$ROOT/.env"
fi
site="$(sed -n 's/^SITE_ADDRESS=//p' "$ROOT/.env" | tail -n1 | tr -d '\r')"
site="${site%\"}"; site="${site#\"}"; site="${site%\'}"; site="${site#\'}"
site="${site#https://}"
if [[ "$site" != "$DESIRED_SITE" ]]; then
  # Permit correcting a placeholder in an unused, first-install .env, while
  # retaining its generated database and JWT secrets. Never rewrite the site
  # for an installed release or a database that already contains user data.
  if [[ ! -e "$ROOT/current" && ! -L "$ROOT/current" ]] &&
     ! docker volume inspect geocauce_postgres_data >/dev/null 2>&1 &&
     { [[ "$site" == "geocauce.example.org" ]] ||
       [[ "$site" == "localhost" ]] || [[ "$site" == "http://localhost" ]]; }; then
    env_tmp="$(mktemp "$ROOT/.env.XXXXXXXX")"
    sed "s|^SITE_ADDRESS=.*$|SITE_ADDRESS=$DESIRED_SITE|" "$ROOT/.env" > "$env_tmp"
    chmod 600 "$env_tmp"
    mv "$env_tmp" "$ROOT/.env"
    site="$DESIRED_SITE"
    echo "Updated first-install placeholder hostname; database and JWT secrets retained."
  else
    die "SITE_ADDRESS in the existing .env differs from GEOCAUCE_SITE_ADDRESS. Check DNS and the server configuration."
  fi
fi

if [[ -L "$ROOT/current" ]]; then
  PREVIOUS="$(readlink -f "$ROOT/current")"
  [[ -f "$PREVIOUS/compose.yaml" ]] || die "Previous release is incomplete."
elif [[ -e "$ROOT/current" ]]; then
  die "The current path must be a symlink, not a directory."
fi

cleanup() {
  result=$?
  trap - EXIT
  rm -f "$ARCHIVE" || true
  if [[ "$result" -ne 0 && "$ROTATED_PASSWORD" -eq 1 ]]; then
    echo "Deployment failed after password rotation: restoring original PostgreSQL password..." >&2
    if change_pg_password "$OLD_DB_PASSWORD"; then
      if ! write_password_file "$OLD_DB_PASSWORD"; then
        echo "WARNING: Failed to restore password file. Manual recovery required." >&2
      fi
    else
      echo "WARNING: Failed to restore the database role password. Manual recovery required." >&2
    fi
  fi
  if [[ "$result" -ne 0 && "$STARTED" -eq 1 ]]; then
    if [[ -n "$PREVIOUS" ]]; then
      echo "Deployment failed: restoring previous containers..." >&2
      if docker compose --env-file "$ROOT/.env" -f "$PREVIOUS/compose.yaml" \
        up -d --build --force-recreate; then
        echo "Previous containers restored. Check their health." >&2
      else
        echo "WARNING: rollback failed. Manual recovery is required." >&2
      fi
    else
      echo "Initial deployment failed; no previous release exists." >&2
    fi
  fi
  exit "$result"
}
trap cleanup EXIT

RELEASE="$ROOT/releases/$SHA"
if [[ ! -d "$RELEASE" ]]; then
  stage="$(mktemp -d "$ROOT/releases/.incoming.XXXXXXXX")"
  tar -xzf "$ARCHIVE" -C "$stage"
  [[ -f "$stage/compose.yaml" && -f "$stage/backend/geocauce_api/app.py" ]] ||
    die "Incomplete monorepo archive."
  mv "$stage" "$RELEASE"
fi

# Validate before modifying running containers.
docker compose --env-file "$ROOT/.env" -f "$RELEASE/compose.yaml" config --quiet

[[ "$site" =~ ^[a-zA-Z0-9.-]+$ ]] || die "SITE_ADDRESS must be a public DNS hostname."

# Recover a first installation that started a healthy database and running Compose services but
# failed only the final HTTPS smoke check, leaving volumes without /current.
# The container labels must prove that every service belongs to the existing
# Geocauce release. Never adopt arbitrary volumes or replace their credentials.
if [[ -z "$PREVIOUS" ]] &&
   docker volume inspect geocauce_postgres_data >/dev/null 2>&1; then
  echo "Found persistent PostgreSQL data without a finalized /current release."
  for service in db api web; do
    container="geocauce-$service-1"
    identity="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}:{{index .Config.Labels "com.docker.compose.service"}}:{{.State.Running}}:{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container" 2>/dev/null || true)"
    # db has a Docker healthcheck; api and web have none in compose.yaml.
    # If any service later gains one, it must pass before adoption.
    if [[ "$service" == "db" ]]; then
      [[ "$identity" == "geocauce:db:true:healthy" ]] ||
        die "Existing PostgreSQL container is not healthy. Manual recovery required."
    else
      [[ "$identity" == "geocauce:$service:true:missing" ||
         "$identity" == "geocauce:$service:true:healthy" ]] ||
        die "Existing $container is not running or reports an unhealthy status. Manual recovery required."
    fi
  done
  previous_compose="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' geocauce-db-1)"
  [[ "$previous_compose" =~ ^/opt/geocauce/releases/[0-9a-f]{40}/compose\.yaml$ ]] ||
    die "Cannot verify the Compose file of the existing containers. Manual recovery required."
  [[ -f "$previous_compose" ]] ||
    die "The previous Compose file is missing. Manual recovery required."
  for service in db api web; do
    container="geocauce-$service-1"
    container_compose="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$container")"
    [[ "$container_compose" == "$previous_compose" ]] ||
      die "Existing containers came from different releases. Manual recovery required."
  done
  PREVIOUS="${previous_compose%/compose.yaml}"
  echo "Verified healthy interrupted initial installation; backing up before retry."
fi

# Backups are mandatory whenever an existing database volume is found.
if docker volume inspect geocauce_postgres_data >/dev/null 2>&1; then
  [[ -n "$PREVIOUS" ]] ||
    die "Persistent data exists without a verified previous release. No automatic overwrite allowed."
  docker volume inspect geocauce_files_data >/dev/null ||
    die "The private-file volume is missing. Deployment halted."
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  db_backup="$ROOT/backups/postgres-${stamp}-${SHA:0:8}.dump"
  file_backup="$ROOT/backups/files-${stamp}-${SHA:0:8}.tar.gz"
  echo "Backing up PostgreSQL before deployment..."
  docker compose --env-file "$ROOT/.env" -f "$PREVIOUS/compose.yaml" \
    exec -T db pg_dump -U "$DB_USERNAME" -d geocauce -Fc > "$db_backup"
  [[ -s "$db_backup" ]] || die "PostgreSQL backup is empty."
  echo "Backing up the private file volume..."
  # The container needs root to read private blobs; make the encrypted-backup candidate
  # private (but still unencrypted) and owned by the deploy user after writing it.
  docker run --rm --network none \
    -v geocauce_files_data:/input:ro \
    -v "$ROOT/backups:/output" alpine:3.21 \
    sh -c 'umask 077; tar -czf "/output/$1" -C /input . && chown "$2:$3" "/output/$1"' \
    sh "$(basename "$file_backup")" "$(id -u)" "$(id -g)"
  [[ -s "$file_backup" ]] || die "Storage backup is empty."
  echo "Local backups created. Remember to copy them encrypted OFF the VPS."
elif [[ -n "$PREVIOUS" ]]; then
  die "Existing release has no PostgreSQL volume. Possible data loss."
fi

# Only rotate after backups have completed. A running app may briefly lose
# database access between ALTER ROLE and replacement of its API containers.
if [[ "$ROTATE_PASSWORD" -eq 1 ]]; then
  docker exec -e PGPASSWORD="$OLD_DB_PASSWORD" geocauce-db-1 \
    psql -X -h 127.0.0.1 -U "$DB_USERNAME" -d geocauce -tAc 'SELECT 1' >/dev/null 2>&1 ||
    die "Existing PostgreSQL credentials failed direct TCP authentication. No rotation performed."
  echo "Rotating existing PostgreSQL password (backups completed)..."
  STARTED=1
  if ! change_pg_password "$DB_PASSWORD"; then
    die "PostgreSQL role password rotation failed. Check DB health; secrets not changed."
  fi
  ROTATED_PASSWORD=1
  write_password_file "$DB_PASSWORD"
  docker exec -e PGPASSWORD="$DB_PASSWORD" geocauce-db-1 \
    psql -X -h 127.0.0.1 -U "$DB_USERNAME" -d geocauce -tAc 'SELECT 1' | grep -qx '1' ||
    die "PostgreSQL rejected the new password. Restoring previous password."
fi

echo "Deploying commit ${SHA:0:12}..."
STARTED=1
docker compose --env-file "$ROOT/.env" -f "$RELEASE/compose.yaml" \
  up -d --build --wait --wait-timeout 180

# The /health endpoint alone does not prove that SQLAlchemy can authenticate.
docker compose --env-file "$ROOT/.env" -f "$RELEASE/compose.yaml" \
  exec -T api python -c 'from geocauce_api.database import engine; from sqlalchemy import text; connection = engine.connect(); print(connection.execute(text("SELECT 1")).scalar()); connection.close()' |
  grep -qx '1' || die "New API cannot authenticate to PostgreSQL."

url="https://$site"
echo "Checking API and frontend through HTTPS (allowing Caddy time to issue TLS certificate)..."
# Caddy's container becomes healthy before an ACME certificate is necessarily
# available. Retrying only connection-refused does not catch TLS error 35.
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error \
  --retry 15 --retry-all-errors --retry-delay 3 --connect-timeout 5 --max-time 15 \
  "$url/health" >/dev/null
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error \
  --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 5 --max-time 15 \
  "$url/" >/dev/null
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error --max-time 15 "$url/supabase-config.js" |
  grep -q 'window.location.origin' || die "Frontend is not configured for the local API."

# Only mark as current after all smoke checks pass.
ln -sfn "$RELEASE" "$ROOT/.current-next"
mv -Tf "$ROOT/.current-next" "$ROOT/current"
echo "Deployment successful: $url ($SHA)"
