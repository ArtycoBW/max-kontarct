/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import { DealFileVisibility } from "@prisma/client";

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
      deal: { findUnique: jest.fn(async () => deal([USER_ID, OTHER_USER_ID])) },
      dealFile: { findFirst: jest.fn(), findMany: jest.fn(async () => []) },
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
