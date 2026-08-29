-- Bootstrap the production catalog with questionnaire metadata only.
-- Legal contract text is generated separately and is not embedded in these fixtures.

WITH template AS (
  INSERT INTO "contract_templates" (
    "id", "slug", "title", "summary", "is_demo", "created_at", "updated_at"
  ) VALUES (
    '31000000-0000-4000-8000-000000000001',
    'property-rental',
    'Аренда имущества',
    'Жильё, помещение или другое имущество во временное пользование',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "summary" = EXCLUDED."summary",
    "is_demo" = false,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
), version AS (
  INSERT INTO "contract_template_versions" (
    "id", "template_id", "version_number", "status", "questionnaire_schema",
    "published_at", "archived_at", "created_at", "updated_at"
  )
  SELECT
    '32000000-0000-4000-8000-000000000001',
    "id",
    1,
    'PUBLISHED',
    '{
      "$schema":"https://json-schema.org/draft/2020-12/schema",
      "type":"object",
      "title":"Условия аренды",
      "additionalProperties":false,
      "properties":{
        "propertyDescription":{"type":"string","title":"Предмет аренды","description":"Опишите имущество и его основные характеристики","minLength":3,"maxLength":500},
        "startDate":{"type":"string","format":"date","title":"Дата начала аренды"},
        "endDate":{"type":"string","format":"date","title":"Дата окончания аренды"},
        "paymentAmount":{"type":"number","title":"Размер платежа, ₽","minimum":0},
        "paymentFrequency":{"type":"string","title":"Периодичность оплаты","enum":["Единовременно","Ежемесячно","Посуточно"]},
        "depositAmount":{"type":"number","title":"Обеспечительный платёж, ₽","minimum":0},
        "utilitiesIncluded":{"type":"boolean","title":"Коммунальные платежи включены","description":"Отметьте, если отдельная оплата не требуется"}
      },
      "required":["propertyDescription","startDate","endDate","paymentAmount","paymentFrequency","utilitiesIncluded"]
    }'::jsonb,
    TIMESTAMPTZ '2026-08-30 00:00:00+00',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM template
  ON CONFLICT ("template_id", "version_number") DO UPDATE SET
    "status" = 'PUBLISHED',
    "questionnaire_schema" = EXCLUDED."questionnaire_schema",
    "published_at" = EXCLUDED."published_at",
    "archived_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
)
INSERT INTO "template_document_requirements" (
  "id", "template_version_id", "key", "title", "description", "required",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), version."id", requirement."key", requirement."title",
  requirement."description", requirement."required", requirement."sort_order",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM version
CROSS JOIN (VALUES
  ('identity_document', 'Документ, удостоверяющий личность', 'Для проверки реквизитов стороны', true, 10),
  ('property_document', 'Документ на имущество', 'Подтверждает право передавать имущество в аренду', false, 20),
  ('condition_act', 'Акт состояния имущества', 'Фиксирует состояние и комплектность при передаче', false, 30)
) AS requirement("key", "title", "description", "required", "sort_order")
ON CONFLICT ("template_version_id", "key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "required" = EXCLUDED."required",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

WITH template AS (
  INSERT INTO "contract_templates" (
    "id", "slug", "title", "summary", "is_demo", "created_at", "updated_at"
  ) VALUES (
    '31000000-0000-4000-8000-000000000002',
    'paid-services',
    'Оказание услуг',
    'Условия оказания услуг, сроки выполнения и порядок оплаты',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "summary" = EXCLUDED."summary",
    "is_demo" = false,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
), version AS (
  INSERT INTO "contract_template_versions" (
    "id", "template_id", "version_number", "status", "questionnaire_schema",
    "published_at", "archived_at", "created_at", "updated_at"
  )
  SELECT
    '32000000-0000-4000-8000-000000000002',
    "id",
    1,
    'PUBLISHED',
    '{
      "$schema":"https://json-schema.org/draft/2020-12/schema",
      "type":"object",
      "title":"Условия оказания услуг",
      "additionalProperties":false,
      "properties":{
        "serviceDescription":{"type":"string","title":"Описание услуги","description":"Укажите ожидаемый результат и объём услуги","minLength":3,"maxLength":1000},
        "serviceLocation":{"type":"string","title":"Место оказания услуги","maxLength":500},
        "completionDate":{"type":"string","format":"date","title":"Срок оказания услуги"},
        "paymentAmount":{"type":"number","title":"Стоимость услуги, ₽","minimum":0},
        "paymentProcedure":{"type":"string","title":"Порядок оплаты","enum":["После оказания услуги","Предоплата 100%","Предоплата и окончательный расчёт"]}
      },
      "required":["serviceDescription","completionDate","paymentAmount","paymentProcedure"]
    }'::jsonb,
    TIMESTAMPTZ '2026-08-30 00:00:00+00',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM template
  ON CONFLICT ("template_id", "version_number") DO UPDATE SET
    "status" = 'PUBLISHED',
    "questionnaire_schema" = EXCLUDED."questionnaire_schema",
    "published_at" = EXCLUDED."published_at",
    "archived_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
)
INSERT INTO "template_document_requirements" (
  "id", "template_version_id", "key", "title", "description", "required",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), version."id", requirement."key", requirement."title",
  requirement."description", requirement."required", requirement."sort_order",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM version
CROSS JOIN (VALUES
  ('identity_document', 'Документ, удостоверяющий личность', 'Для проверки реквизитов стороны', true, 10),
  ('service_specification', 'Описание или техническое задание', 'Уточняет состав и ожидаемый результат услуги', false, 20),
  ('service_acceptance_act', 'Акт оказанных услуг', 'Фиксирует приёмку результата', false, 30)
) AS requirement("key", "title", "description", "required", "sort_order")
ON CONFLICT ("template_version_id", "key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "required" = EXCLUDED."required",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

WITH template AS (
  INSERT INTO "contract_templates" (
    "id", "slug", "title", "summary", "is_demo", "created_at", "updated_at"
  ) VALUES (
    '31000000-0000-4000-8000-000000000003',
    'personal-loan',
    'Заём между физическими лицами',
    'Передача денежных средств и согласованный порядок возврата',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "summary" = EXCLUDED."summary",
    "is_demo" = false,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
), version AS (
  INSERT INTO "contract_template_versions" (
    "id", "template_id", "version_number", "status", "questionnaire_schema",
    "published_at", "archived_at", "created_at", "updated_at"
  )
  SELECT
    '32000000-0000-4000-8000-000000000003',
    "id",
    1,
    'PUBLISHED',
    '{
      "$schema":"https://json-schema.org/draft/2020-12/schema",
      "type":"object",
      "title":"Условия займа",
      "additionalProperties":false,
      "properties":{
        "loanAmount":{"type":"number","title":"Сумма займа, ₽","minimum":1},
        "returnDate":{"type":"string","format":"date","title":"Дата возврата"},
        "interestType":{"type":"string","title":"Условия начисления процентов","enum":["Без процентов","С процентами"]},
        "interestRate":{"type":"number","title":"Процентная ставка, % годовых","minimum":0,"maximum":100},
        "earlyRepaymentAllowed":{"type":"boolean","title":"Досрочный возврат разрешён"},
        "purpose":{"type":"string","title":"Цель займа","maxLength":500}
      },
      "required":["loanAmount","returnDate","interestType","earlyRepaymentAllowed"]
    }'::jsonb,
    TIMESTAMPTZ '2026-08-30 00:00:00+00',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM template
  ON CONFLICT ("template_id", "version_number") DO UPDATE SET
    "status" = 'PUBLISHED',
    "questionnaire_schema" = EXCLUDED."questionnaire_schema",
    "published_at" = EXCLUDED."published_at",
    "archived_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
)
INSERT INTO "template_document_requirements" (
  "id", "template_version_id", "key", "title", "description", "required",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), version."id", requirement."key", requirement."title",
  requirement."description", requirement."required", requirement."sort_order",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM version
CROSS JOIN (VALUES
  ('identity_document', 'Документ, удостоверяющий личность', 'Для проверки реквизитов стороны', true, 10),
  ('transfer_confirmation', 'Подтверждение передачи денег', 'Чек, расписка или банковский документ', false, 20),
  ('repayment_schedule', 'График возврата', 'Нужен при возврате несколькими платежами', false, 30)
) AS requirement("key", "title", "description", "required", "sort_order")
ON CONFLICT ("template_version_id", "key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "required" = EXCLUDED."required",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

WITH template AS (
  INSERT INTO "contract_templates" (
    "id", "slug", "title", "summary", "is_demo", "created_at", "updated_at"
  ) VALUES (
    '31000000-0000-4000-8000-000000000004',
    'movable-property-sale',
    'Купля-продажа движимого имущества',
    'Продажа техники, мебели, оборудования или другого имущества',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "summary" = EXCLUDED."summary",
    "is_demo" = false,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
), version AS (
  INSERT INTO "contract_template_versions" (
    "id", "template_id", "version_number", "status", "questionnaire_schema",
    "published_at", "archived_at", "created_at", "updated_at"
  )
  SELECT
    '32000000-0000-4000-8000-000000000004',
    "id",
    1,
    'PUBLISHED',
    '{
      "$schema":"https://json-schema.org/draft/2020-12/schema",
      "type":"object",
      "title":"Условия купли-продажи",
      "additionalProperties":false,
      "properties":{
        "propertyDescription":{"type":"string","title":"Описание имущества","description":"Укажите вид, состояние и основные характеристики","minLength":3,"maxLength":1000},
        "propertyIdentifier":{"type":"string","title":"Серийный номер или другой идентификатор","maxLength":200},
        "price":{"type":"number","title":"Цена, ₽","minimum":0},
        "transferDate":{"type":"string","format":"date","title":"Дата передачи"},
        "transferLocation":{"type":"string","title":"Место передачи","maxLength":500},
        "paymentMethod":{"type":"string","title":"Способ оплаты","enum":["Банковский перевод","Наличные","Иной согласованный способ"]}
      },
      "required":["propertyDescription","price","transferDate","paymentMethod"]
    }'::jsonb,
    TIMESTAMPTZ '2026-08-30 00:00:00+00',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM template
  ON CONFLICT ("template_id", "version_number") DO UPDATE SET
    "status" = 'PUBLISHED',
    "questionnaire_schema" = EXCLUDED."questionnaire_schema",
    "published_at" = EXCLUDED."published_at",
    "archived_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
)
INSERT INTO "template_document_requirements" (
  "id", "template_version_id", "key", "title", "description", "required",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), version."id", requirement."key", requirement."title",
  requirement."description", requirement."required", requirement."sort_order",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM version
CROSS JOIN (VALUES
  ('identity_document', 'Документ, удостоверяющий личность', 'Для проверки реквизитов стороны', true, 10),
  ('ownership_document', 'Документ на имущество', 'Добавьте при наличии документа, подтверждающего приобретение', false, 20),
  ('property_photos', 'Фотографии имущества', 'Фиксируют внешний вид и состояние перед передачей', false, 30)
) AS requirement("key", "title", "description", "required", "sort_order")
ON CONFLICT ("template_version_id", "key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "required" = EXCLUDED."required",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

WITH template AS (
  INSERT INTO "contract_templates" (
    "id", "slug", "title", "summary", "is_demo", "created_at", "updated_at"
  ) VALUES (
    '31000000-0000-4000-8000-000000000005',
    'work-contract',
    'Выполнение работ',
    'Ремонт, монтаж, изготовление или другие работы с приёмкой результата',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "summary" = EXCLUDED."summary",
    "is_demo" = false,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
), version AS (
  INSERT INTO "contract_template_versions" (
    "id", "template_id", "version_number", "status", "questionnaire_schema",
    "published_at", "archived_at", "created_at", "updated_at"
  )
  SELECT
    '32000000-0000-4000-8000-000000000005',
    "id",
    1,
    'PUBLISHED',
    '{
      "$schema":"https://json-schema.org/draft/2020-12/schema",
      "type":"object",
      "title":"Условия выполнения работ",
      "additionalProperties":false,
      "properties":{
        "workDescription":{"type":"string","title":"Описание работ","description":"Укажите объём и ожидаемый результат","minLength":3,"maxLength":1000},
        "workLocation":{"type":"string","title":"Место выполнения работ","maxLength":500},
        "startDate":{"type":"string","format":"date","title":"Дата начала"},
        "endDate":{"type":"string","format":"date","title":"Дата окончания"},
        "price":{"type":"number","title":"Стоимость работ, ₽","minimum":0},
        "materialsIncluded":{"type":"boolean","title":"Материалы включены в стоимость"}
      },
      "required":["workDescription","workLocation","startDate","endDate","price","materialsIncluded"]
    }'::jsonb,
    TIMESTAMPTZ '2026-08-30 00:00:00+00',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM template
  ON CONFLICT ("template_id", "version_number") DO UPDATE SET
    "status" = 'PUBLISHED',
    "questionnaire_schema" = EXCLUDED."questionnaire_schema",
    "published_at" = EXCLUDED."published_at",
    "archived_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "id"
)
INSERT INTO "template_document_requirements" (
  "id", "template_version_id", "key", "title", "description", "required",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), version."id", requirement."key", requirement."title",
  requirement."description", requirement."required", requirement."sort_order",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM version
CROSS JOIN (VALUES
  ('identity_document', 'Документ, удостоверяющий личность', 'Для проверки реквизитов стороны', true, 10),
  ('work_specification', 'Смета или описание работ', 'Фиксирует объём, материалы и ожидаемый результат', false, 20),
  ('work_acceptance_act', 'Акт выполненных работ', 'Фиксирует приёмку результата', false, 30),
  ('material_receipts', 'Документы на материалы', 'Чеки или накладные при отдельной оплате материалов', false, 40)
) AS requirement("key", "title", "description", "required", "sort_order")
ON CONFLICT ("template_version_id", "key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "required" = EXCLUDED."required",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;
