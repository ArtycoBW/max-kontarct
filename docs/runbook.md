# Эксплуатация и восстановление

## Диагностика

```bash
systemctl status max-contract-backend max-contract-frontend max-contract-worker
curl --fail https://www.max-kontrakt.ru/api/v1/health/live
curl --fail https://www.max-kontrakt.ru/api/v1/health/ready
journalctl -u max-contract-backend -u max-contract-worker --since '15 minutes ago' --no-pager
nginx -t
df -h /opt/max-contract
systemctl list-timers max-contract-backup.timer
journalctl -u max-contract-backup.service -n 20 --no-pager
```

Для Docker: `docker compose -f docker-compose.prod.yml ps`, `logs --tail=100 api worker web`, `exec api node -e "fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>r.json()).then(console.log)"`.

При отказе Redis/S3 не удалять данные и не перезапускать сделки. Проверить доступность зависимости, секреты/срок действия ключей, свободное место, queue prefix и worker. Ошибки искать по requestId и коду; не включать запись request body или сторонних error-body ради диагностики.

## Ежедневный backup

Настроить `/etc/max-contract/backup.env` по `deploy/backup/backup.env.example`, права 0600. Установить service/timer из `deploy/systemd`, выполнить `systemctl daemon-reload` и `systemctl enable --now max-contract-backup.timer`. Запустить `systemctl start max-contract-backup.service` и проверить журнал.

Резервная копия PostgreSQL: custom dump, режим 0600, проверка `pg_restore --list`, отдельный SHA-256. Retention по умолчанию 14 дней; удаляются только имена, созданные этим скриптом. Старые ручные копии не удаляются. Timer — ежедневно 03:20 UTC с задержкой до 10 минут. Контролировать успешный запуск каждый день: timer сам по себе не является внешним оповещением о сбое.

## Проверка восстановления (только отдельная база)

1. Выбрать конкретный dump и проверить рядом лежащий `sha256sum -c <имя>.sha256`.
2. Создать **новую пустую тестовую базу** на PostgreSQL 16. Не подставлять имя рабочей базы.
3. `docker exec -i <test-postgres> pg_restore -U <test-user> -d <new-test-db> --no-owner --no-acl --exit-on-error < <dump>`.
4. Сверить список миграций, количество сделок, подписей и артефактов; выборочно проверить ссылки/хеши. Результат записать в журнал проверки, затем закрыть доступ к тестовой копии: она содержит реальные персональные данные.
5. Восстановление рабочей базы — только при остановке записей и согласованном плане восстановления. Не выполнять `--clean` по рабочей базе как обычный шаг выкладки.

## S3 и аварии

Файлы хранятся в приватном Timeweb S3, не на диске приложения. Backup PostgreSQL содержит метаданные, но **не байты PDF и вложений**. До передачи включить/проверить versioning и retention в S3, отдельную резервную копию объектов и копию DB вне этого сервера; удалённые объекты сохранять дольше срока хранения соответствующих документов. Доступность и тариф versioning/репликации согласовать с клиентом и провайдером. Без отдельного хранилища backup потеря сервера остаётся риском. Инвентаризация и восстановление должны сопоставлять ключи объектов, версии и SHA-256 с базой.
