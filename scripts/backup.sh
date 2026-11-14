#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/postgres-${stamp}.dump"
docker run --rm -v geocauce_files_data:/input:ro -v "$PWD/backups:/output" alpine:3.21 \
 tar -czf "/output/files-${stamp}.tar.gz" -C /input .
echo "COPY BOTH FILES OFF THE VPS AND ENCRYPT THEM. These backups are local only."
