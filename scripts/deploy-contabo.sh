#!/usr/bin/env bash
# Invoked over SSH by .github/workflows/deploy-contabo.yml.
# Persistent Docker volumes are never deleted; an existing .env is never replaced.
set -Eeuo pipefail
umask 077

ROOT=/opt/geocauce
SHA="${1:-}"
ARCHIVE="${2:-}"
DESIRED_SITE="${3:-}"
STARTED=0
PREVIOUS=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
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
  command -v openssl >/dev/null || die "openssl is required for first-time secret generation."
  env_tmp="$(mktemp "$ROOT/.env.XXXXXXXX")"
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
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

# Backups are mandatory whenever an existing database volume is found.
if docker volume inspect geocauce_postgres_data >/dev/null 2>&1; then
  [[ -n "$PREVIOUS" ]] ||
    die "Persistent data exists without a previous release. No automatic overwrite allowed."
  docker volume inspect geocauce_files_data >/dev/null ||
    die "The private-file volume is missing. Deployment halted."
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  db_backup="$ROOT/backups/postgres-${stamp}-${SHA:0:8}.dump"
  file_backup="$ROOT/backups/files-${stamp}-${SHA:0:8}.tar.gz"
  echo "Backing up PostgreSQL before deployment..."
  docker compose --env-file "$ROOT/.env" -f "$PREVIOUS/compose.yaml" \
    exec -T db pg_dump -U geocauce -d geocauce -Fc > "$db_backup"
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

echo "Deploying commit ${SHA:0:12}..."
STARTED=1
docker compose --env-file "$ROOT/.env" -f "$RELEASE/compose.yaml" \
  up -d --build --wait --wait-timeout 180

url="https://$site"
echo "Checking API and frontend through HTTPS..."
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error --retry 10 --retry-delay 3 \
  --retry-connrefused --max-time 15 "$url/health" >/dev/null
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error --retry 5 --retry-delay 3 \
  --retry-connrefused --max-time 15 "$url/" >/dev/null
curl --noproxy "*" --resolve "$site:443:127.0.0.1" --fail --silent --show-error --max-time 15 "$url/supabase-config.js" |
  grep -q 'window.location.origin' || die "Frontend is not configured for the local API."

# Only mark as current after all smoke checks pass.
ln -sfn "$RELEASE" "$ROOT/.current-next"
mv -Tf "$ROOT/.current-next" "$ROOT/current"
echo "Deployment successful: $url ($SHA)"
