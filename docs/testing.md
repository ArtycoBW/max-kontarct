# Проверки

## Быстрая регрессия

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm audit
```

`test` — модульные проверки API и Web. `test:e2e` — HTTP-контракты Nest. Проверки реальной PostgreSQL запускаются отдельно через `npm run test:integration`, с `TEST_DATABASE_URL` на тестовый PostgreSQL, доступным пользователю с правом создания базы. Создаётся случайная база `max_contract_it_*`; рабочая база не используется.

## Сквозной браузерный сценарий (7.1)

```bash
docker run -d --name max-contract-browser-postgres -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only -p 127.0.0.1:25434:5432 postgres:16-alpine
npx playwright install chromium
npm run test:browser
```

Для другого локального порта задать `BROWSER_TEST_DATABASE_URL` (только localhost/127.0.0.1). Нужны свободные порты 4300 и 4301. Скрипт собирает API и Web с изолированным API-адресом; после него перед выкладкой нужна обычная production-сборка с ENV соответствующего окружения.

Тест создаёт случайную базу `max_contract_browser_*`, использует настоящий Nest, Prisma, HTTP и браузер. Подменены только внешние MAX, ИИ, SMS, S3 и Redis/доставка фоновой задачи. Код подписи случайный: тест получает его от перехваченного тестового SMS-провайдера, а не из интерфейса или production API. Тестовые служебные маршруты существуют только в `apps/api/test/browser/server.cjs`, слушают loopback и не входят в сборку API/Docker.

Две независимые сессии проходят анкету, генерацию, приглашение, вход без необязательных уведомлений, загрузку и ручную проверку документов, согласование, две подписи. Проверяются обновление открытой вкладки, приватность файлов, PDF, публичная проверка, SHA-256 всех файлов ZIP и отсутствие личных документов в общем архиве. Дополнительно: отказ в доступе постороннему, неверный/просроченный/replay MAX, ограничение перебора приглашений.

Отчёт: `playwright-report/index.html`; снимки, PDF/ZIP и trace ошибки: `test-results/`. Это синтетические данные, каталоги исключены из Git. После аварийного завершения Windows может не доставить SIGTERM дочернему процессу; оставшиеся тестовые базы удалять только вместе с выделенным тестовым контейнером, не выполнять массовое удаление баз на общем сервере.

## Docker smoke

```bash
export APP_ENV_FILE=deploy/docker/smoke.env HTTP_PORT=38080 RELEASE_TAG=stage7-smoke
docker compose -p max-contract-smoke -f docker-compose.prod.yml -f deploy/docker/compose.smoke.yml --profile tools build
docker compose -p max-contract-smoke -f docker-compose.prod.yml -f deploy/docker/compose.smoke.yml up -d --wait postgres redis s3
docker compose -p max-contract-smoke -f docker-compose.prod.yml -f deploy/docker/compose.smoke.yml --profile tools run --rm migrate
docker compose -p max-contract-smoke -f docker-compose.prod.yml -f deploy/docker/compose.smoke.yml up -d --wait api worker web proxy
curl --fail http://127.0.0.1:38080/api/v1/health/ready
```

В этом профиле S3 отвечает только на HEAD, а реальные ИИ/SMS не вызываются: это проверка запуска контейнеров, а не повтор полного E2E. Остановить только проект `max-contract-smoke` командой `docker compose ... down`; production-проект не трогать. Для полного пользовательского сценария использовать браузерный тест выше.
