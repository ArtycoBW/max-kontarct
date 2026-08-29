# Production deployment

Production runs behind nginx with two systemd services:

- `max-contract-backend.service` — NestJS API on `127.0.0.1:3001`;
- `max-contract-frontend.service` — Next.js Mini App on `127.0.0.1:3000`.
- `max-contract-worker.service` — BullMQ worker for contract generation.

`CONTRACT_GENERATION_QUEUE_PREFIX` must be unique for every environment that
shares Redis. Production uses `max-contract`; temporary test stands use an
isolated prefix.

The active release is `/opt/max-contract/current`. Runtime secrets are stored
only in `/etc/max-contract/max-contract.env` with mode `0600`; this file must
never be added to Git or copied into a release.

Before switching the `current` symlink, a release must pass:

```bash
npm ci
npm run test
npm run build
npm run prisma:migrate:deploy
```

After switching, validate configuration and health:

```bash
nginx -t
systemctl restart max-contract-backend max-contract-frontend max-contract-worker
curl --fail https://max-kontrakt.ru/api/v1/health/live
curl --fail https://max-kontrakt.ru/api/v1/health/ready
```
