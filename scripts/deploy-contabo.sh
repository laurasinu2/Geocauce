#!/usr/bin/env bash
# Invoked over SSH by .github/workflows/deploy-contabo.yml.
# Persistent Docker volumes and /opt/geocauce/.env are never replaced.
set -Eeuo pipefail
umask 077

ROOT=/opt/geocauce
SHA="${1:-}"
ARCHIVE="${2:-}"
STARTED=0
PREVIOUS=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "Invalid commit SHA."
[[ "$ARCHIVE" =~ ^/opt/geocauce/incoming/geocauce-release-[0-9]+-[0-9]+-[0-9a-f]{12}\.tar\.gz$ ]] ||
  die "Unexpected upload path."
[[ -f "$ARCHIVE" ]] || die "Uploaded release archive not found."
[[ -d "$ROOT" && -f "$ROOT/.env" ]] ||
  die "Prepare /opt/geocauce/.env on the VPS before deployment."
command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null || die "Docker Compose v2 is required."
command -v flock >/dev/null || die "flock is required."
command -v curl >/dev/null || die "curl is required."

mkdir -p "$ROOT/releases" "$ROOT/backups"
chmod 700 "$ROOT/backups"
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || die "Another deployment is running."

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

site="$(sed -n 's/^SITE_ADDRESS=//p' "$ROOT/.env" | tail -n1 | tr -d '\r')"
site="${site%\"}"; site="${site#\"}"; site="${site%\'}"; site="${site#\'}"
site="${site#https://}"
[[ "$site" =~ ^[a-zA-Z0-9.-]+$ ]] || die "SITE_ADDRESS must be a public DNS hostname."
[[ "$site" != "localhost" && "$site" != "geocauce.example.org" ]] ||
  die "Configure the public DNS domain in SITE_ADDRESS before deploying."

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
