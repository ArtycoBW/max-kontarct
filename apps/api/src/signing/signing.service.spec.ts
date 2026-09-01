/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DealStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { MaxBotService } from "../max-bot/max-bot.service";
import { OtpService } from "./otp.service";
import { SigningService } from "./signing.service";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const dealId = "20000000-0000-4000-8000-000000000001";
const versionId = "30000000-0000-4000-8000-000000000001";
const partyId = "40000000-0000-4000-8000-000000000001";
const documentHash = "a".repeat(64);

describe("SigningService", () => {
  it("stores a signature against the exact frozen hash without persisting the OTP", async () => {
    const context = signingContext();
    const createSignature = jest.fn(async ({ data }) => {
      context.versions[0]!.signatures.push({ partyId, signedAt: new Date("2026-09-01T12:00:00.000Z"), userId });
      return { id: "50000000-0000-4000-8000-000000000001", ...data };
    });
    const createAudit = jest.fn(async () => ({}));
    const transaction = {
      auditEvent: { create: createAudit },
      deal: { updateMany: jest.fn(async () => ({ count: 1 })) },
      dealSignature: {
        count: jest.fn(async () => 1),
        create: createSignature,
        findUnique: jest.fn(async () => null),
      },
    };
    const prisma = prismaMock(context, transaction);
    const otp = { verify: jest.fn(async () => ({ channel: "FAKE", messageId: "provider-id", phoneId: "phone-1" })) };
    const service = createService(prisma, otp);

    const result = await service.confirm(userId, dealId, { code: "1234", versionId }, {
      ipAddress: "127.0.0.1", requestId: "request-1", userAgent: "unit-test",
    });

    expect(createSignature).toHaveBeenCalledWith({ data: expect.objectContaining({
      dealVersionId: versionId,
      documentHash,
      partyId,
      pepDocumentVersion: "pep-v1",
      userId,
      verifiedPhoneId: "phone-1",
    }) });
    const serialized = JSON.stringify(createAudit.mock.calls);
    expect(serialized).not.toContain("1234");
    expect(serialized).toContain(documentHash);
    expect(result.currentUserSigned).toBe(true);
  });

  it("is idempotent when the current party already signed", async () => {
    const context = signingContext();
    context.versions[0]!.signatures.push({ partyId, signedAt: new Date(), userId });
    const otp = { verify: jest.fn() };
    const service = createService(prismaMock(context), otp);

    const result = await service.confirm(userId, dealId, { code: "1234", versionId }, {
      ipAddress: null, userAgent: null,
    });

    expect(otp.verify).not.toHaveBeenCalled();
    expect(result.currentUserSigned).toBe(true);
  });

  it("audits only the OTP error code when verification fails", async () => {
    const context = signingContext();
    const audit = jest.fn(async () => ({}));
    const prisma = prismaMock(context);
    prisma.auditEvent = { create: audit };
    const otp = { verify: jest.fn(async () => { throw new UnauthorizedException({ code: "OTP_INVALID", message: "Нет" }); }) };
    const service = createService(prisma, otp);

    await expect(service.confirm(userId, dealId, { code: "9999", versionId }, {
      ipAddress: null, userAgent: null,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: "OTP_INVALID" }) });

    expect(JSON.stringify(audit.mock.calls)).toContain("OTP_INVALID");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("9999");
  });
});

function createService(prisma: Record<string, any>, otp: Record<string, any>) {
  return new SigningService(
    new ConfigService({ CONSENT_ELECTRONIC_SIGNATURE_VERSION: "pep-v1" }),
    { sendUserNotification: jest.fn(async () => true) } as unknown as MaxBotService,
    otp as unknown as OtpService,
    prisma as unknown as PrismaService,
  );
}

function prismaMock(context: ReturnType<typeof signingContext>, transaction: Record<string, any> = {}) {
  return {
    $transaction: jest.fn(async (input) => typeof input === "function" ? input(transaction) : Promise.all(input)),
    auditEvent: { create: jest.fn(async () => ({})) },
    deal: { findFirst: jest.fn(async () => context) },
  } as Record<string, any>;
}

function signingContext() {
  return {
    id: dealId,
    parties: [
      {
        id: partyId,
        role: "INITIATOR",
        user: {
          maxAccount: { firstName: "Иван", lastName: "Иванов", maxUserId: "123" },
          phones: [{ e164: "+79990000001", id: "phone-1" }],
          profile: { firstName: "Иван", lastName: "Иванов" },
        },
        userId,
      },
      {
        id: "40000000-0000-4000-8000-000000000002",
        role: "COUNTERPARTY",
        user: {
          maxAccount: { firstName: "Анна", lastName: "Петрова", maxUserId: "456" },
          phones: [{ e164: "+79990000002", id: "phone-2" }],
          profile: { firstName: "Анна", lastName: "Петрова" },
        },
        userId: otherUserId,
      },
    ],
    status: DealStatus.READY_TO_SIGN,
    versions: [{
      contractNumber: "МК-20260901-ABCDEF12-V1",
      frozenAt: new Date("2026-09-01T10:00:00.000Z"),
      id: versionId,
      signatures: [] as Array<{ partyId: string; signedAt: Date; userId: string }>,
      snapshotHash: documentHash,
      versionNumber: 1,
    }],
  };
}
