import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { templateAiInstructions } from "./template-ai-instructions";
import { TemplateSchemaValidator } from "./template-schema.validator";
import { confirmedContractTerms } from "./contract-confirmed-terms";
import { declaredRoleTerm } from "../deals/declared-party-roles";
import { extractSupportedAnswers } from "./deal-intake.service";
import type { ContractTemplateDetailsResponse } from "@max-contract/contracts";

const sql = readFileSync(resolve(__dirname, "../../prisma/migrations/20261006120000_vehicle_sale_template/migration.sql"), "utf8");
const schema = JSON.parse(sql.match(/'(\{[\s\S]*\})'::jsonb/)![1]!) as Record<string, unknown>;
const validator = new TemplateSchemaValidator();

it.each(["vehicle-sale", "movable-property-sale", "paid-services", "work-contract", "property-rental", "personal-loan", "individual-agreement"])("provides distinct instructions for %s", slug => {
  expect(templateAiInstructions(slug)).not.toBe(templateAiInstructions("unknown"));
});

it("publishes a renderable automobile questionnaire without rewriting existing catalog entries", () => {
  expect(() => validator.assertSchema("vehicle", schema)).not.toThrow();
  expect(schema.required).toEqual(expect.arrayContaining(["manufactureYear", "mileage", "vin", "ptsDocument", "stsDocument", "vehicleDefects", "vehicleRestrictions", "handoverItems"]));
  expect(sql).not.toMatch(/UPDATE\s+contract_template_versions|DELETE\s+FROM/i);
  expect(declaredRoleTerm("vehicle-sale", "COUNTERPARTY")).toContain("Инициатор — покупатель");
});

it("retains model, year, mileage, city and price as separate evidenced facts", () => {
  const template = { currentVersion: { id: "vehicle", questionnaireSchema: schema } } as unknown as ContractTemplateDetailsResponse;
  const source = "Продам Toyota Corolla 2001 года, пробег 150000 км за 300000 рублей в г. Иркутск";
  const fields = [
    { key: "vehicleDescription", value: "Toyota Corolla 2001 года", evidence: "toyota corolla 2001 года" },
    { key: "manufactureYear", value: "2001", evidence: "2001 года" },
    { key: "mileage", value: "150000", evidence: "150000 км" },
    { key: "price", value: "300000", evidence: "300000 рублей" },
    { key: "transferLocation", value: "г. Иркутск", evidence: "г. Иркутск" },
  ];
  const { answers } = extractSupportedAnswers(template, source, fields, validator);
  expect(answers).toEqual({ vehicleDescription: "Toyota Corolla 2001 года", manufactureYear: 2001, mileage: 150000, price: 300000, transferLocation: "г. Иркутск" });
  expect(answers).not.toHaveProperty("ptsDocument");
});

it("places every confirmed automobile characteristic into the deterministic contract section", () => {
  const answers = { vehicleDescription: "Toyota Corolla", manufactureYear: 2001, mileage: 150000, ptsDocument: "ЭПТС отсутствует", stsDocument: "СТС отсутствует", vin: "VIN отсутствует", price: 300000 };
  const terms = confirmedContractTerms(schema, answers, {}, []);
  expect(terms).toEqual(expect.arrayContaining(["Год выпуска: 2001.", "Пробег, км: 150 000.", "ПТС / ЭПТС: ЭПТС отсутствует.", "СТС: СТС отсутствует."]));
});
