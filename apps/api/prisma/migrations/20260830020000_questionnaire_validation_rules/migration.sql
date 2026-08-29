-- Preserve a deterministic UI order inside jsonb and add business validation rules.

UPDATE "contract_template_versions"
SET "questionnaire_schema" =
  jsonb_set(
    jsonb_set(
      jsonb_set("questionnaire_schema", '{properties,propertyDescription,minLength}', '10'::jsonb),
      '{properties,paymentAmount,minimum}', '1'::jsonb
    ),
    '{x-fieldOrder}',
    '["propertyDescription","startDate","endDate","paymentAmount","paymentFrequency","depositAmount","utilitiesIncluded"]'::jsonb
  ) || '{"x-rules":[{"kind":"dateOrder","startField":"startDate","endField":"endDate","message":"Дата окончания аренды не может быть раньше даты начала"}]}'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '32000000-0000-4000-8000-000000000001';

UPDATE "contract_template_versions"
SET "questionnaire_schema" =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set("questionnaire_schema", '{properties,serviceDescription,minLength}', '10'::jsonb),
        '{properties,serviceLocation,minLength}', '2'::jsonb
      ),
      '{properties,paymentAmount,minimum}', '1'::jsonb
    ),
    '{x-fieldOrder}',
    '["serviceDescription","serviceLocation","completionDate","paymentAmount","paymentProcedure"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '32000000-0000-4000-8000-000000000002';

UPDATE "contract_template_versions"
SET "questionnaire_schema" =
  jsonb_set(
    jsonb_set(
      jsonb_set("questionnaire_schema", '{properties,purpose,minLength}', '3'::jsonb),
      '{properties,interestRate,minimum}', '0.01'::jsonb
    ),
    '{x-fieldOrder}',
    '["loanAmount","returnDate","interestType","interestRate","earlyRepaymentAllowed","purpose"]'::jsonb
  ) || '{"x-rules":[{"kind":"requiredWhen","field":"interestRate","dependsOn":"interestType","equals":"С процентами","message":"Укажите процентную ставку"}]}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '32000000-0000-4000-8000-000000000003';

UPDATE "contract_template_versions"
SET "questionnaire_schema" =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set("questionnaire_schema", '{properties,propertyDescription,minLength}', '10'::jsonb),
          '{properties,propertyIdentifier,minLength}', '2'::jsonb
        ),
        '{properties,price,minimum}', '1'::jsonb
      ),
      '{properties,transferLocation,minLength}', '2'::jsonb
    ),
    '{x-fieldOrder}',
    '["propertyDescription","propertyIdentifier","price","transferDate","transferLocation","paymentMethod"]'::jsonb
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '32000000-0000-4000-8000-000000000004';

UPDATE "contract_template_versions"
SET "questionnaire_schema" =
  jsonb_set(
    jsonb_set(
      jsonb_set("questionnaire_schema", '{properties,workDescription,minLength}', '10'::jsonb),
      '{properties,workLocation,minLength}', '2'::jsonb
    ),
    '{properties,price,minimum}', '1'::jsonb
  ) || '{"x-fieldOrder":["workDescription","workLocation","startDate","endDate","price","materialsIncluded"],"x-rules":[{"kind":"dateOrder","startField":"startDate","endField":"endDate","message":"Дата окончания работ не может быть раньше даты начала"}]}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '32000000-0000-4000-8000-000000000005';
