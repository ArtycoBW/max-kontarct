import { materialsUploaderLabel } from "./party-responsibility";

describe("materials uploader labels", () => {
  it.each([
    ["movable-property-sale", "Продавец"],
    ["vehicle-sale", "Продавец"],
    ["paid-services", "Исполнитель"],
    ["work-contract", "Исполнитель"],
    ["property-rental", "Арендодатель"],
    ["personal-loan", "Займодавец"],
  ])("names the provider for %s regardless of who created the deal", (slug, label) => {
    expect(materialsUploaderLabel(slug, "INITIATOR")).toBe(label);
    expect(materialsUploaderLabel(slug, "COUNTERPARTY")).toBe(label);
  });
  it("uses participant names when a business role is unknown", () => {
    expect(materialsUploaderLabel("individual", "INITIATOR")).toBe("Инициатор");
    expect(materialsUploaderLabel("individual", "COUNTERPARTY")).toBe("Контрагент");
    expect(materialsUploaderLabel("movable-property-sale", null)).toBe("Инициатор");
  });
});
