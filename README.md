# Max-Контракт

Production monorepo для MAX Mini App по созданию, согласованию и подписанию договоров между физическими лицами.

На текущем этапе реализовано ядро Mini App: MAX/dev-авторизация, согласия,
подтверждённый телефон, профиль физлица, RBAC-оболочка администрирования и
versioned API опубликованных шаблонов.
YandexGPT подключён через server-side adapter. Интеграции DaData и SMSC
относятся к этапам проверки данных и подписания.

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
npm run prisma:migrate:deploy
npm run prisma:seed
npm run dev
```

Приложения:

- Web: http://localhost:3000
- Admin shell: http://localhost:3000/admin
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
npm run test:integration
npm run build
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml ps
```

Остановить локальную инфраструктуру без удаления данных:

```powershell
npm run infra:down
```

Именованные Docker volumes сохраняются после остановки Compose.

## Роли в локальной разработке

Текущий dev-пользователь по умолчанию имеет роль `USER`. После первого входа
роль можно переключить для проверки `/admin`:

```powershell
npm run dev:role -- ADMIN
npm run dev:role -- SUPPORT
npm run dev:role -- USER
```

После команды обновите страницу. Helper принимает только `USER`, `ADMIN` или
`SUPPORT`, пишет audit event и полностью запрещён при `NODE_ENV=production`.

## Локальная база данных

`prisma:migrate:deploy` применяет versioned migrations и не использует `db push`.
`prisma:seed` добавляет только явно помеченные mock-пользователя и демонстрационный
шаблон, а при `NODE_ENV=production` полностью запрещён. Утверждённые юридические
тексты в seed не входят. Seed идемпотентен и предназначен только для локальной
разработки. Обе команды явно читают корневые `.env.local`/`.env`; без них в
local development используется конфигурация Docker из `.env.example`, но в
production `DATABASE_URL` всегда обязателен.

Пользовательские endpoints шаблонов требуют авторизованную сессию и отдают
только последнюю опубликованную версию:

- `GET /api/v1/templates` — список;
- `GET /api/v1/templates/:slug` — JSON Schema анкеты и требования к документам.

Integration-тесты создают отдельную случайную PostgreSQL-базу, накатывают в неё
все migrations с нуля и удаляют её после проверки. Локальная dev-база при этом
не изменяется. Для отдельного тестового сервера используется
`TEST_DATABASE_URL`; тесты не запускаются при `NODE_ENV=production`.
