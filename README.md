# Max-Контракт

Production monorepo для MAX Mini App по созданию, согласованию и подписанию договоров между физическими лицами.

На текущем этапе подключена только локальная инфраструктура. Реальные MAX, YandexGPT, DaData и SMSC API не используются.

## Требования

- Node.js 20.9 или новее;
- npm 10 или новее;
- Docker с Docker Compose.

## Структура

```text
apps/
  design-review/  референс макетов; не входит в production Mini App
  web/            production Next.js Mini App
  api/            production NestJS API
packages/
  contracts/      общие TypeScript-контракты
docker-compose.dev.yml
```

## Первый запуск

```powershell
Copy-Item .env.example .env
npm ci
npm run infra:up
npm run infra:ps
npm run dev
```

Приложения:

- Web: http://localhost:3000
- API liveness: http://localhost:3001/api/v1/health/live
- API readiness: http://localhost:3001/api/v1/health/ready
- Swagger UI: http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/docs-json
- Design review: http://localhost:3002
- Jeton prototype: http://localhost:3002/concept/jeton/prototype?screen=splash
- MinIO API: http://localhost:9100
- MinIO Console: http://localhost:9101

PostgreSQL доступен на `localhost:5434`, Redis — на `localhost:6381`.

## Проверки

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml ps
```

Остановить локальную инфраструктуру без удаления данных:

```powershell
npm run infra:down
```

Именованные Docker volumes сохраняются после остановки Compose.
