/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DealFileVisibility, DealStatus } from "@prisma/client";

import type { StorageService } from "../storage/storage.service";
import { FilesService, resolveFileVisibility } from "./files.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000002";
const DEAL_ID = "20000000-0000-4000-8000-000000000001";
const FILE_ID = "30000000-0000-4000-8000-000000000001";

describe("FilesService ACL", () => {
  let prisma: any;
  let storage: jest.Mocked<StorageService>;
  let service: FilesService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(prisma)),
      auditEvent: { create: jest.fn() },
      deal: {
        findUnique: jest.fn(async () => deal([USER_ID, OTHER_USER_ID])),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      dealApproval: { updateMany: jest.fn(async () => ({ count: 2 })) },
      dealFile: {
        findFirst: jest.fn(),
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userTrustCheck: { upsert: jest.fn() },
    };
    storage = {
      checkHealth: jest.fn(),
      deleteObject: jest.fn(),
      ensureBucket: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
    };
    service = new FilesService(prisma, storage, new ConfigService({
      FILE_UPLOAD_MAX_BYTES: 20 * 1024 * 1024,
      S3_BUCKET: "private",
    }));
  });

  it("hides an existing deal from a non-participant", async () => {
    prisma.deal.findUnique.mockResolvedValue(deal([OTHER_USER_ID]));
    await expect(service.getWorkspace(USER_ID, DEAL_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dealFile.findMany).not.toHaveBeenCalled();
  });

  it("scopes a file lookup to the requested deal to prevent IDOR", async () => {
    prisma.dealFile.findFirst.mockResolvedValue(null);
    await expect(service.download(USER_ID, DEAL_ID, FILE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dealFile.findFirst).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID, id: FILE_ID },
    });
  });

  it("does not reveal another party's owner-only document", async () => {
    prisma.dealFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      mimeType: "application/pdf",
      objectKey: "private/key",
      originalName: "passport.pdf",
      ownerUserId: OTHER_USER_ID,
      visibility: DealFileVisibility.OWNER_ONLY,
    });
    await expect(service.download(USER_ID, DEAL_ID, FILE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("allows a participant to download a shared deal material", async () => {
    prisma.dealFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      mimeType: "application/pdf",
      objectKey: "private/key",
      originalName: "act.pdf",
      ownerUserId: OTHER_USER_ID,
      visibility: DealFileVisibility.DEAL_PARTICIPANTS,
    });
    storage.getObject.mockResolvedValue({ body: Buffer.from("%PDF-"), contentType: "application/pdf" });
    await expect(service.download(USER_ID, DEAL_ID, FILE_ID)).resolves.toMatchObject({
      file: { originalName: "act.pdf" },
    });
  });

  it("classifies identity documents as owner-only and evidence as shared", () => {
    expect(resolveFileVisibility({ key: "identity_document", title: "Удостоверение личности" }))
      .toBe(DealFileVisibility.OWNER_ONLY);
    expect(resolveFileVisibility({ key: "property_document", title: "Документ на имущество" }))
      .toBe(DealFileVisibility.DEAL_PARTICIPANTS);
    expect(resolveFileVisibility(null)).toBe(DealFileVisibility.DEAL_PARTICIPANTS);
  });

  it("requires a meaningful comment when an administrator rejects a file", async () => {
    await expect(service.review(USER_ID, FILE_ID, { comment: " ", status: "REJECTED" }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dealFile.update).not.toHaveBeenCalled();
  });

  it("records a manual decision, audit event and internal trust status", async () => {
    const reviewedAt = new Date("2026-09-01T12:00:00.000Z");
    prisma.dealFile.findUnique.mockResolvedValue({ id: FILE_ID });
    prisma.dealFile.update.mockResolvedValue({
      deal: { title: "Аренда" },
      dealId: DEAL_ID,
      id: FILE_ID,
      mimeType: "application/pdf",
      originalName: "document.pdf",
      owner: { maxAccount: null, profile: { firstName: "Иван", lastName: "Иванов" } },
      ownerUserId: OTHER_USER_ID,
      requirement: null,
      reviewComment: null,
      reviewedAt,
      reviewStatus: "ACCEPTED",
      sizeBytes: 10n,
      uploadedAt: reviewedAt,
      visibility: "DEAL_PARTICIPANTS",
    });
    prisma.deal.findUnique.mockResolvedValue({
      templateVersion: { documentRequirements: [] },
    });

    await expect(service.review(USER_ID, FILE_ID, { comment: null, status: "ACCEPTED" }))
      .resolves.toMatchObject({ reviewStatus: "ACCEPTED" });
    expect(prisma.auditEvent.create).toHaveBeenCalled();
    expect(prisma.userTrustCheck.upsert).toHaveBeenCalled();
  });

  it("opens final terms approval after every required document is accepted", async () => {
    const reviewedAt = new Date("2026-09-01T12:00:00.000Z");
    const requirementId = "40000000-0000-4000-8000-000000000001";
    prisma.dealFile.findUnique.mockResolvedValue({ id: FILE_ID });
    prisma.dealFile.update.mockResolvedValue({
      deal: { title: "Аренда" }, dealId: DEAL_ID, id: FILE_ID,
      mimeType: "application/pdf", originalName: "document.pdf",
      owner: { maxAccount: null, profile: { firstName: "Иван", lastName: "Иванов" } },
      ownerUserId: OTHER_USER_ID, requirement: { title: "Документ" },
      requirementId, reviewComment: null, reviewedAt, reviewStatus: "ACCEPTED",
      sizeBytes: 10n, uploadedAt: reviewedAt, visibility: "DEAL_PARTICIPANTS",
    });
    prisma.deal.findUnique
      .mockResolvedValueOnce({
        templateVersion: { documentRequirements: [{ id: requirementId, required: true }] },
      })
      .mockResolvedValueOnce({
        parties: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
        status: DealStatus.DOCUMENTS_REVIEW,
        templateVersion: { documentRequirements: [{ id: requirementId, required: true }] },
        versions: [{ id: "50000000-0000-4000-8000-000000000001" }],
      });
    prisma.dealFile.findMany
      .mockResolvedValueOnce([{ requirementId }])
      .mockResolvedValueOnce([
        { ownerUserId: USER_ID, requirementId },
        { ownerUserId: OTHER_USER_ID, requirementId },
      ]);

    await service.review(USER_ID, FILE_ID, { comment: null, status: "ACCEPTED" });

    expect(prisma.deal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DealStatus.TERMS_REVIEW }),
    }));
    expect(prisma.dealApproval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REVOKED" }),
    }));
  });
});

function deal(participantIds: string[]) {
  return {
    id: DEAL_ID,
    parties: participantIds.map((userId) => ({ userId })),
    status: "DOCUMENTS_PENDING",
    templateVersion: { documentRequirements: [] },
    title: "Аренда",
  };
}
