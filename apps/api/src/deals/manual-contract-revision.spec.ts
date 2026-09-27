import { DealStatus } from "@prisma/client";
import { DealsService } from "./deals.service";
import { DealStateMachineService } from "./deal-state-machine.service";

const text = {
  title: "Договор", preamble: "Иванов Иван Иванович и Петров Пётр Петрович заключили договор.", warnings: [],
  sections: [{ heading: "Условия", clauses: ["Продажа ноутбука модели А, серийный номер 12345.", "Стоимость 10000 рублей. Оплата при встрече.", "Передача по адресу: г. Москва, ул. Примерная, д. 10.", "Покупатель подтверждает приёмку на месте при встрече."] }],
};
const now = new Date("2026-09-27T10:00:00Z");
function setup(status: DealStatus = DealStatus.TERMS_REVIEW) {
  const record = { id: "deal", initiatorUserId: "seller", status, createdAt: now, updatedAt: now, title: "Договор",
    templateVersion: { id: "template", versionNumber: 1, template: { slug: "movable-property-sale", title: "Продажа" } },
    versions: [{ id: "v1", sourceGenerationId: "generation", versionNumber: 1, contractDraft: { ...text, title: "Старая версия" }, terms: { answers: { price: 5000 }, description: "Продажа ноутбука", currentStep: "INITIATOR", creationPath: "AI", clarificationSessionId: "old" } }],
  };
  const repository = { findOwnedDraft: jest.fn().mockResolvedValue(record), revisionParties: jest.fn().mockResolvedValue({ INITIATOR: "Иванов Иван Иванович", COUNTERPARTY: "Петров Пётр Петрович" }), createVersion: jest.fn().mockResolvedValue(record) };
  return { repository, service: new DealsService(repository as never, new DealStateMachineService()) };
}
const request = { contractDraft: text, changeSummary: "Стоимость 10000 рублей", expectedVersionId: "v1", expectedUpdatedAt: now.toISOString() };
describe("direct contract revisions", () => {
  it("saves exact text as a new version without a new AI generation or stale answers", async () => {
    const { repository, service } = setup(DealStatus.READY_TO_SIGN);
    await service.editContract("seller", "deal", request);
    expect(repository.createVersion).toHaveBeenCalledWith(expect.objectContaining({ contractDraft: text, sourceGenerationId: null, versionNumber: 2, nextStatus: "TERMS_REVIEW", expectedUpdatedAt: now,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      terms: expect.objectContaining({ answers: {}, clarificationSessionId: null, manualRevision: { partyNames: { INITIATOR: "Иванов Иван Иванович", COUNTERPARTY: "Петров Пётр Петрович" } } }),
    }));
  });
  it.each([DealStatus.SIGNED_BY_ONE, DealStatus.SIGNED, DealStatus.COMPLETED, DealStatus.CANCELED, DealStatus.DRAFT])("does not change immutable or ungenerated state %s", async status => {
    const { repository, service } = setup(status);
    await expect(service.editContract("seller", "deal", request)).rejects.toThrow();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
  it("rejects another participant", async () => {
    const { repository, service } = setup();
    await expect(service.editContract("buyer", "deal", request)).rejects.toThrow();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
  it("rejects stale version and stale timestamp", async () => {
    const { repository, service } = setup();
    await expect(service.editContract("seller", "deal", { ...request, expectedVersionId: "v0" })).rejects.toThrow();
    expect(repository.createVersion).not.toHaveBeenCalled();
    repository.createVersion.mockResolvedValue(null);
    await expect(service.editContract("seller", "deal", request)).rejects.toThrow();
  });
  it("does not save incomplete text", async () => {
    const { repository, service } = setup();
    await expect(service.editContract("seller", "deal", { ...request, contractDraft: { ...text, sections: [] } })).rejects.toThrow();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});
