-- Internal questionnaire, not a publicly reusable AI-generated legal template.
-- Personal descriptions, answers and generated drafts remain in owned deals/generations.
INSERT INTO contract_templates (id, slug, title, summary, is_demo, created_at, updated_at)
VALUES ('31000000-0000-4000-8000-000000000006', 'individual-agreement', 'Индивидуальный договор',
  'Проект по индивидуальным условиям двух физических лиц. Требует проверки сторонами.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO contract_template_versions (id, template_id, version_number, status, questionnaire_schema, published_at, created_at, updated_at)
VALUES ('32000000-0000-4000-8000-000000000006', '31000000-0000-4000-8000-000000000006', 1, 'PUBLISHED',
'{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "type":"object", "title":"Индивидуальные условия", "additionalProperties":false,
  "properties":{
    "subject":{"type":"string","title":"Предмет договора","description":"Что стороны хотят оформить и какой результат ожидают","minLength":10,"maxLength":2000},
    "initiatorObligations":{"type":"string","title":"Обязанности инициатора","description":"Что выполняете или предоставляете вы","minLength":5,"maxLength":2000},
    "counterpartyObligations":{"type":"string","title":"Обязанности второй стороны","description":"Что выполняет или предоставляет второй участник","minLength":5,"maxLength":2000},
    "completionDate":{"type":"string","format":"date","title":"Срок исполнения"},
    "paymentAmount":{"type":"number","title":"Сумма, ₽","minimum":0},
    "settlementProcedure":{"type":"string","title":"Порядок расчётов","description":"Укажите порядок оплаты либо что договор безвозмездный","maxLength":1000},
    "performanceLocation":{"type":"string","title":"Место или способ исполнения","maxLength":500},
    "additionalTerms":{"type":"string","title":"Дополнительные условия","description":"Передача результата, приёмка и другие договорённости","maxLength":2000}
  },
  "required":["subject","initiatorObligations","counterpartyObligations"],
  "x-fieldOrder":["subject","initiatorObligations","counterpartyObligations","completionDate","paymentAmount","settlementProcedure","performanceLocation","additionalTerms"]
}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO template_document_requirements (id, template_version_id, key, title, description, required, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), '32000000-0000-4000-8000-000000000006', 'identity_document', 'Документ, удостоверяющий личность',
  'Для сверки реквизитов стороны', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '32000000-0000-4000-8000-000000000006', 'additional_document', 'Приложение к договору',
  'Дополнительные условия или описание результата', false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
