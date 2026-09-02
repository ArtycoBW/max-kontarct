# Разработка

Монорепозиторий npm: `apps/web` — интерфейс, `apps/api` — API и worker, `packages/contracts` — общие типы. `apps/design-review` — утверждённый прототип, не пользовательское приложение.

Нужны Node.js 22, npm 10+, Docker Compose. Не копировать серверные секреты в рабочую папку.

```bash
cp .env.example .env
npm ci
npm run infra:up
npm run prisma:migrate:deploy
npm run dev
```

В отдельном терминале для обработки очереди:

```bash
npm run build --workspace @max-contract/api
npm run start:worker --workspace @max-contract/api
```

Web: http://localhost:3000, API: http://localhost:3001/api/v1, прототип: http://localhost:3002. Локальные MAX/ИИ/адреса/SMS используют тестовые адаптеры. В настоящем MAX вход проверяется сервером по подписи, роль администратора хранится в базе.

После изменения Prisma: создать и проверить миграцию на отдельной базе; в релизе выполнять только `prisma migrate deploy`. Не запускать `db push` и `migrate reset` на стенде/production.
