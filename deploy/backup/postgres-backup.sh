#!/usr/bin/env bash
set -euo pipefail
umask 077
config=${BACKUP_ENV_FILE:-/etc/max-contract/backup.env}
[[ -f "$config" ]] || { echo 'Backup configuration is missing' >&2; exit 1; }
source "$config"
: "${BACKUP_DIR:=/opt/max-contract/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"
: "${BACKUP_POSTGRES_CONTAINER:?Set BACKUP_POSTGRES_CONTAINER}"
: "${BACKUP_DATABASE_USER:?Set BACKUP_DATABASE_USER}"
: "${BACKUP_DATABASE_NAME:?Set BACKUP_DATABASE_NAME}"
: "${BACKUP_APP_ENV_FILE:=/etc/max-contract/max-contract.env}"
if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || (( BACKUP_RETENTION_DAYS < 2 || BACKUP_RETENTION_DAYS > 3650 )); then
    echo 'Retention must be between 2 and 3650 days' >&2; exit 1
fi
mkdir -p -- "$BACKUP_DIR"
directory=$(realpath -- "$BACKUP_DIR")
[[ "$directory" == /*/backups && "$directory" != /backups && ! -L "$BACKUP_DIR" ]] || { echo 'Unsafe backup directory' >&2; exit 1; }
exec 9>"$directory/.backup.lock"
flock -n 9 || { echo 'Another backup is running' >&2; exit 1; }
name="max-contract-$(date -u +%Y%m%dT%H%M%SZ).dump"
[[ ! -e "$directory/$name" ]] || { echo 'Backup already exists' >&2; exit 1; }
partial="$directory/$name.partial"
trap 'if [[ -f "$partial" ]]; then rm -- "$partial"; fi' EXIT
docker exec "$BACKUP_POSTGRES_CONTAINER" pg_dump --username "$BACKUP_DATABASE_USER" --dbname "$BACKUP_DATABASE_NAME" --format=custom --no-owner --no-acl > "$partial"
[[ -s "$partial" ]]
docker exec -i "$BACKUP_POSTGRES_CONTAINER" pg_restore --list < "$partial" > /dev/null
mv -- "$partial" "$directory/$name"
(cd "$directory" && sha256sum -- "$name" > "$name.sha256")

# A verified local dump is not sufficient if the host itself is lost. Reuse the
# private application S3 credentials unless a dedicated backup credential is set.
[[ -f "$BACKUP_APP_ENV_FILE" ]] || { echo 'Application environment for external backup is missing' >&2; exit 1; }
set -a
source "$BACKUP_APP_ENV_FILE"
set +a
export BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-${S3_ENDPOINT:-${MINIO_ENDPOINT:-}}}"
export BACKUP_S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-${S3_ACCESS_KEY:-${MINIO_ACCESS_KEY:-}}}"
export BACKUP_S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-${S3_SECRET_KEY:-${MINIO_SECRET_KEY:-}}}"
export BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-${S3_BUCKET:-${MINIO_BUCKET:-}}}"
export BACKUP_S3_REGION="${BACKUP_S3_REGION:-${S3_REGION:-${MINIO_REGION:-ru-central1}}}"
export BACKUP_S3_FORCE_PATH_STYLE="${BACKUP_S3_FORCE_PATH_STYLE:-${S3_FORCE_PATH_STYLE:-true}}"
export BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-private/backups/postgres}"
"$(dirname "$0")/upload-backup-s3.cjs" "$directory/$name" "$directory/$name.sha256"

# Retention applies exclusively to this script's named dump/checksum files.
find "$directory" -maxdepth 1 -type f \( -name 'max-contract-????????T??????Z.dump' -o -name 'max-contract-????????T??????Z.dump.sha256' \) -mtime "+$BACKUP_RETENTION_DAYS" -print -delete
echo "Backup verified: $name"
