import { ContractGenerationsRepository, type ContractGenerationRecord } from "./contract-generations.repository";
import type { PrismaService } from "../database/prisma.service";

const profile = { firstName: "Иван", lastName: "Примеров", middleName: "Петрович", birthDate: new Date("1990-01-01"), passportDetails: {
  series: "1234", number: "567890", issuedAt: "2020-01-01", issuer: "Тестовый отдел", divisionCode: "123-456", birthPlace: "Тест", gender: "М",
} };
describe("contract generation participant gate", () => {
  const findFirst = jest.fn();
  const repository = new ContractGenerationsRepository({ deal: { findFirst } } as unknown as PrismaService);
  const generation = { id: "session", userId: "owner", providerMetadata: {} } as ContractGenerationRecord;
  const party = (role: string, data: unknown = profile) => ({ role, user: { profile: data } });
  it.each([null, { id: "deal", parties: [] }, { id: "deal", parties: [party("INITIATOR")] },
    { id: "deal", parties: [party("INITIATOR"), party("COUNTERPARTY", null)] },
    { id: "deal", parties: [party("INITIATOR", { firstName: "Имя" }), party("COUNTERPARTY")] },
  ])("rejects missing or incomplete participants", async deal => {
    findFirst.mockResolvedValue(deal);
    await expect(repository.requireReadyParties(generation, "deal")).rejects.toMatchObject({ response: { code: "CONTRACT_PARTIES_NOT_READY" } });
  });
  it("checks ownership, template, unsigned state and returns full names", async () => {
    findFirst.mockResolvedValue({ id: "deal", parties: [party("INITIATOR"), party("COUNTERPARTY")] });
    await expect(repository.requireReadyParties(generation, "deal")).resolves.toMatchObject({ dealId: "deal", names: { INITIATOR: "Примеров Иван Петрович" } });
    expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: "deal", initiatorUserId: "owner", templateVersion: { aiGenerations: { some: { id: "session" } } },
      status: { notIn: ["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"] },
    }) as unknown }));
  });
  it("does not rebind a session to another deal", async () => {
    await expect(repository.requireReadyParties({ ...generation, providerMetadata: { dealId: "other" } }, "deal")).rejects.toMatchObject({ response: { code: "DEAL_GENERATION_MISMATCH" } });
  });
});
