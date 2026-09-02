#!/usr/bin/env bash
set -euo pipefail
# Use ONLY a dedicated test PostgreSQL container/user/database.
container=${1:?Pass the dedicated test PostgreSQL container}
user=${2:?Pass its test user}
database=${3:?Pass its test database}
script_dir=$(cd "$(dirname "$0")" && pwd)
fixture=$(mktemp -d /tmp/max-contract-backup-test.XXXXXXXX)
mkdir "$fixture/backups"
printf 'BACKUP_POSTGRES_CONTAINER=%q\nBACKUP_DATABASE_USER=%q\nBACKUP_DATABASE_NAME=%q\nBACKUP_DIR=%q\nBACKUP_RETENTION_DAYS=14\n' "$container" "$user" "$database" "$fixture/backups" > "$fixture/config"
printf 'expired test data' > "$fixture/backups/max-contract-20000101T000000Z.dump"
printf 'manual test data' > "$fixture/backups/manual-keep.dump"
touch -d '30 days ago' "$fixture/backups/max-contract-20000101T000000Z.dump" "$fixture/backups/manual-keep.dump"
BACKUP_ENV_FILE="$fixture/config" bash "$script_dir/postgres-backup.sh"
[[ ! -e "$fixture/backups/max-contract-20000101T000000Z.dump" ]]
[[ -f "$fixture/backups/manual-keep.dump" ]]
(cd "$fixture/backups" && sha256sum -c max-contract-*.sha256)
echo "Backup + retention test passed; synthetic fixture: $fixture"
