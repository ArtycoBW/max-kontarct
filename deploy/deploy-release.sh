#!/usr/bin/env bash
set -euo pipefail
revision=${1:?Pass a commit SHA matching /tmp/max-contract-SHA.tar}
[[ "$revision" =~ ^[a-f0-9]{7,40}$ ]] || exit 1
archive="/tmp/max-contract-$revision.tar"
[[ -f "$archive" && -f /etc/max-contract/backup.env ]] || { echo 'Archive or backup configuration missing' >&2; exit 1; }
previous=$(readlink -f /opt/max-contract/current)
[[ "$previous" == /opt/max-contract/releases/* ]] || exit 1
release="/opt/max-contract/releases/$(date -u +%Y%m%dT%H%M%SZ)-$revision"
[[ ! -e "$release" ]]
mkdir -- "$release"
tar -xf "$archive" -C "$release"
cd "$release"
set -a
source /etc/max-contract/max-contract.env
set +a
npm ci --include=dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build --workspace @max-contract/contracts
npm run build --workspace @max-contract/api
npm run build --workspace @max-contract/web
bash deploy/backup/postgres-backup.sh
npm run prisma:migrate:deploy
node scripts/check-storage-privacy.cjs
chown -R maxcontract:maxcontract "$release"
rollback() {
    ln -sfn "$previous" /opt/max-contract/current.next
    mv -Tf /opt/max-contract/current.next /opt/max-contract/current
    systemctl restart max-contract-backend max-contract-frontend max-contract-worker
    echo "Application rolled back to $previous; schema is not automatically rolled back" >&2
}
trap rollback ERR
nginx -t
ln -sfn "$release" /opt/max-contract/current.next
mv -Tf /opt/max-contract/current.next /opt/max-contract/current
systemctl restart max-contract-backend max-contract-frontend max-contract-worker
curl -fsS --retry 10 --retry-delay 2 --retry-connrefused http://127.0.0.1:3001/api/v1/health/ready
curl -fsS --retry 10 --retry-delay 2 --retry-connrefused --output /dev/null http://127.0.0.1:3000
systemctl is-active max-contract-backend max-contract-frontend max-contract-worker
trap - ERR
printf '\nDEPLOYED %s\n' "$revision"
