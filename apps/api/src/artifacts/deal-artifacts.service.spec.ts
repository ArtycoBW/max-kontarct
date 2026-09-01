/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { createHash } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { DealArtifactType, DealStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { StorageService } from "../storage/storage.service";
import { DealArtifactsService } from "./deal-artifacts.service";

const pdf = Buffer.from("%PDF-1.7\nfixture");

jest.mock("./final-contract-pdf", () => ({
  renderFinalContractPdf: jest.fn(async () => Buffer.from("%PDF-1.7\nfixture")),
}));

describe("DealArtifactsService", () => {
  it("stores the final PDF privately with a SHA-256 and audit record", async () => {
    const artifact = {
      bucket: "private-bucket", createdAt: new Date("2026-09-01T12:02:00.000Z"), dealId: "deal-1",
      id: "artifact-1", mimeType: "application/pdf", objectKey: "private/deals/deal-1/file.pdf",
      originalName: "Договор.pdf", publicCode: "public-code", sha256: createHash("sha256").update(pdf).digest("hex"),
      sizeBytes: BigInt(pdf.length), type: DealArtifactType.FINAL_PDF,
    };
    const transaction = {
      auditEvent: { create: jest.fn(async () => ({})) },
      dealArtifact: { create: jest.fn(async () => artifact) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
      deal: { findUnique: jest.fn(async () => signedDeal()) },
    };
    const storage = { putObject: jest.fn(async () => undefined) };
    const service = new DealArtifactsService(
      new ConfigService({ PUBLIC_WEB_URL: "https://www.max-kontrakt.ru", S3_BUCKET: "private-bucket" }),
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    const result = await service.ensureFinalPdf("deal-1");

    expect(storage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      body: pdf,
      contentType: "application/pdf",
      key: expect.stringMatching(/^private\/deals\/deal-1\/.+\.pdf$/),
      sha256: createHash("sha256").update(pdf).digest("hex"),
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventType: "FINAL_PDF_CREATED" }) });
    expect(result.downloadUrl).toBe("/api/v1/deals/deal-1/artifacts/final-pdf");
  });
});

function signedDeal() {
  return {
    id: "deal-1",
    parties: [{ id: "party-1" }, { id: "party-2" }],
    status: DealStatus.SIGNED,
    versions: [{
      artifacts: [],
      contractNumber: "МК-20260901-ABCDEF12-V1",
      frozenSnapshot: {
        contract: { draft: { preamble: "Текст", sections: [], title: "Договор", warnings: [] }, number: "МК-20260901-ABCDEF12-V1" },
        deal: { id: "deal-1", templateSlug: "test", templateTitle: "Тест", templateVersion: 1, title: "Тест", versionId: "version-1", versionNumber: 1 },
        frozenAt: "2026-09-01T12:00:00.000Z", parties: [], schemaVersion: "deal-signature-v1", terms: {},
      },
      id: "version-1",
      signatures: [
        { otpChannel: "FAKE", party: { role: "INITIATOR" }, pepDocumentVersion: "pep-v1", signedAt: new Date(), user: { maxAccount: null, profile: { firstName: "Иван", lastName: "Иванов", middleName: null } } },
        { otpChannel: "FAKE", party: { role: "COUNTERPARTY" }, pepDocumentVersion: "pep-v1", signedAt: new Date(), user: { maxAccount: null, profile: { firstName: "Анна", lastName: "Петрова", middleName: null } } },
      ],
      snapshotHash: "a".repeat(64),
      versionNumber: 1,
    }],
  };
}
