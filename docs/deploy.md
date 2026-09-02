# Выкладка

## Действующий стенд

Стенд использует Nginx/TLS и три systemd-сервиса из `deploy/systemd`. Активная версия — `/opt/max-contract/current`, версии — `/opt/max-contract/releases/<release>`. Секреты — `/etc/max-contract/max-contract.env`, права 0600, не в Git. Переключение на контейнеры не требуется для текущих обновлений.

Порядок: создать отдельный release → `npm ci` → lint/typecheck/tests → собрать contracts/API/Web с ENV стенда → backup → `npm run prisma:migrate:deploy` → права `maxcontract:maxcontract` → атомарно переключить symlink → перезапустить backend/frontend/worker → проверить ready и страницу. Не собирать поверх работающей `.next`.

Сохранять предыдущий release. При неуспешной проверке вернуть symlink и перезапустить сервисы. Миграции проектировать обратно совместимыми; откат кода не означает автоматического отката схемы. Если миграция несовместима — остановка записей, отдельное решение о forward-fix либо восстановлении проверенного backup с учётом потерянных после него операций. Подписанные версии и PDF/ZIP никогда не пересоздавать для косметических изменений.

## Контейнерный запуск для передачи

```bash
export APP_ENV_FILE=/etc/max-contract/max-contract.env
export RELEASE_TAG=<commit>
docker compose -f docker-compose.prod.yml --profile tools build
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f docker-compose.prod.yml up -d --wait
curl --fail http://127.0.0.1:8080/api/v1/health/ready
```

API/worker — один non-root runtime-образ; CLI миграций — отдельная цель сборки. Web — standalone-образ без секретов API. Файловая система read-only, временные каталоги — tmpfs. Nginx слушает только host loopback:8080: внешний HTTPS-терминатор обязателен для MAX и Secure-cookie. Не публиковать API/worker/DB/Redis наружу. TLS и заголовки встраивания в MAX сохранить из действующей конфигурации Nginx.

База, Redis и приватное S3 задаются через ENV. `localhost` внутри контейнера — сам контейнер: использовать приватные сетевые DNS/адреса внешних сервисов. Префиксы очереди и сессий уникальны для окружения. `S3_AUTO_CREATE_BUCKET=false` для заранее созданного клиентского bucket. Docker smoke и локальная инфраструктура вынесены отдельно; их учебные пароли запрещены для реальных данных.

В CI теги Node/Nginx разрешать в immutable digest и обновлять после тестов/аудита. Не использовать автоматически обновляющийся тег для отката; сохранять образ релиза. Production ENV валидируется при запуске, ИИ требует Yandex; SMSC и DaData подключать после получения реквизитов клиента.

Git remote на текущей машине пока не задан. URL запрошен владельцу; локальные коммиты и выкладка не заменяют push.
