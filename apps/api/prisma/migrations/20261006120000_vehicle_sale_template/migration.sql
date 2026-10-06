-- A separate catalog entry. Existing versions, drafts and signed contracts are untouched.
WITH template AS (
  INSERT INTO contract_templates (id, slug, title, summary, is_demo, created_at, updated_at)
  VALUES ('31000000-0000-4000-8000-000000000007', 'vehicle-sale', 'Купля-продажа автомобиля',
    'Продажа автомобиля с характеристиками, документами и условиями передачи', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO contract_template_versions (id, template_id, version_number, status, questionnaire_schema, published_at, created_at, updated_at)
SELECT '32000000-0000-4000-8000-000000000007', id, 1, 'PUBLISHED',
'{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "type":"object","title":"Автомобиль и условия продажи","additionalProperties":false,
  "properties":{
    "vehicleDescription":{"type":"string","title":"Марка, модель, цвет и состояние автомобиля","minLength":3,"maxLength":1000},
    "manufactureYear":{"type":"integer","title":"Год выпуска","minimum":1900,"maximum":2100},
    "mileage":{"type":"integer","title":"Пробег, км","minimum":0,"maximum":10000000},
    "vin":{"type":"string","title":"VIN или иной идентификатор автомобиля","description":"VIN, номер кузова/шасси либо пояснение, если VIN отсутствует","minLength":3,"maxLength":200},
    "registrationNumber":{"type":"string","title":"Государственный номер (если есть)","minLength":2,"maxLength":100},
    "ptsDocument":{"type":"string","title":"ПТС / ЭПТС","description":"Номер ПТС/ЭПТС или укажите, что документ отсутствует","minLength":3,"maxLength":300},
    "stsDocument":{"type":"string","title":"СТС","description":"Серия и номер либо пояснение, если СТС отсутствует","minLength":3,"maxLength":300},
    "vehicleDefects":{"type":"string","title":"Известные повреждения и неисправности","description":"Перечислите известные дефекты или явно укажите, что они неизвестны","minLength":3,"maxLength":1000},
    "vehicleRestrictions":{"type":"string","title":"Залог и ограничения","description":"Укажите сведения продавца; это не автоматическая проверка реестров","minLength":3,"maxLength":1000},
    "handoverItems":{"type":"string","title":"Передаваемые ключи и документы","minLength":3,"maxLength":500},
    "price":{"type":"number","title":"Цена, ₽","minimum":1},
    "transferDate":{"type":"string","title":"Дата передачи","format":"date"},
    "transferLocation":{"type":"string","title":"Место передачи","minLength":2,"maxLength":500},
    "paymentMethod":{"type":"string","title":"Способ оплаты","enum":["Банковский перевод","Наличные","Иной согласованный способ"]}
  },
  "required":["vehicleDescription","manufactureYear","mileage","vin","ptsDocument","stsDocument","vehicleDefects","vehicleRestrictions","handoverItems","price","transferDate","transferLocation","paymentMethod"],
  "x-fieldOrder":["vehicleDescription","manufactureYear","mileage","vin","registrationNumber","ptsDocument","stsDocument","vehicleDefects","vehicleRestrictions","handoverItems","price","transferDate","transferLocation","paymentMethod"]
}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template;
