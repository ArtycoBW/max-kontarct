# Max-Контракт

Production monorepo для MAX Mini App по созданию, согласованию и подписанию договоров между физическими лицами.

На текущем этапе реализованы этапы 2 и 3 MVP: MAX/dev-авторизация, согласия,
подтверждённый телефон, профиль физлица, RBAC-администрирование, versioned API
шаблонов и production-каталог из пяти типов сделок. Анкеты валидируются по
JSON Schema и межполевым правилам, включая порядок дат и условно обязательные
поля.

YandexGPT подключён через server-side adapter и фоновую BullMQ-очередь:
уточняющие вопросы и проект договора сохраняются в БД, поддерживаются
идемпотентность, повторный запуск и безопасные метаданные AI-операций. В
админ-панели доступны управление версиями шаблонов и журнал AI-генераций без
ответов пользователей и текста договоров. Интеграции DaData и SMSC относятся
к этапам проверки данных и подписания.

## Диктовка и паспортный OCR

В описании сделки и текстовых ответах доступна диктовка через `SpeechRecognition`
или `webkitSpeechRecognition` (`ru-RU`). Микрофон включается только по действию
пользователя после пояснения об обработке аудио браузером. Поддержка зависит от
браузера и версии MAX WebView; при отсутствии API остаётся ручной ввод и микрофон
клавиатуры. Аудио приложение не сохраняет. Распознавание речи браузер может
выполнять через собственный внешний сервис.

В профиле кнопка «Считать данные паспорта» принимает до трёх фотографий:
орган выдачи, страница с ФИО и актуальная регистрация (не обязательно физические
страницы 1–3). JPG/PNG/WebP до 12 МБ, от 300 px по короткой стороне, до 40 Мп.
Tesseract.js распознаёт печатный русский/английский текст локально в Web Worker.
Фотографии и сырой OCR-текст не отправляются в API, S3 или ИИ и не сохраняются
в браузерное хранилище. В IndexedDB кешируются только языковые модели.

Пользователь сверяет/исправляет результат, подтверждает проверку, переносит поля
в форму и отдельно сохраняет профиль. Нераспознанные поля не затирают уже введённые.
OCR не подтверждает подлинность паспорта или личность. Блики, поворот, мелкий текст
и рукописные штампы требуют ручной проверки; актуальный адрес при нескольких
регистрациях не выбирается автоматически. Старые подписанные договоры не меняются.

`npm ci` готовит локальные модели и WASM в `apps/web/public/ocr/`; каталог генерируется
из закреплённых npm-пакетов и не хранится в Git. Не исключайте его из web deployment.
При обновлении Tesseract обновите и проверьте транспорт `lib/ocr/local-worker.ts`:
он сохраняет нативный Worker handle для отмены даже до загрузки моделей.
`npm run test:browser` проверяет настоящий WASM на синтетических растровых образцах,
отсутствие внешних запросов при OCR, подтверждение перед сохранением и остановку
worker при отмене/ошибке. Это проверка интеграции, не оценка точности на реальных паспортах.

Документация: [Tesseract.js](https://github.com/naptha/tesseract.js),
[Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Требования к окружению

- Node.js 22.13 или новее (включая локальный просмотрщик PDF);
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
- `GET /api/v1/templates/:slug` — JSON Schema анкеты и требования к документам;
- `POST /api/v1/templates/:slug/clarifications` — начать AI-сессию;
- `POST /api/v1/templates/:slug/clarifications/:sessionId/answers` — сохранить
  типизированные ответы и получить следующий статус.

После заполнения анкеты проект договора создаётся в фоновой очереди. API
позволяет запустить генерацию, получить её статус и повторить завершившуюся
ошибкой операцию. Администратор может создавать черновые версии шаблонов,
редактировать их анкету и требования к документам, публиковать и архивировать
версии. Роль `SUPPORT` имеет только чтение.

Integration-тесты создают отдельную случайную PostgreSQL-базу, накатывают в неё
все migrations с нуля и удаляют её после проверки. Локальная dev-база при этом
не изменяется. Для отдельного тестового сервера используется
`TEST_DATABASE_URL`; тесты не запускаются при `NODE_ENV=production`.
