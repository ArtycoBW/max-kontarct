import { createHash } from "node:crypto";

import JSZip from "jszip";

import { buildEvidencePackage } from "./evidence-package";

describe("buildEvidencePackage", () => {
  it("includes the allowed material and a matching checksum manifest", async () => {
    const contract = Buffer.from("%PDF-fixture");
    const attachment = Buffer.from("image-fixture");
    const body = await buildEvidencePackage({
      auditEvents: [{ eventType: "DEAL_VERSION_SIGNED_WITH_PEP" }],
      contract: { body: contract, mimeType: "application/pdf", path: "contract/final.pdf" },
      createdAt: new Date("2026-09-01T12:02:00.000Z"),
      files: [{ body: attachment, mimeType: "image/jpeg", path: "attachments/photo.jpg" }],
      signatures: [{ documentHash: "a".repeat(64) }],
    });
    const zip = await JSZip.loadAsync(body);
    const manifest = JSON.parse(await zip.file("manifest.sha256.json")!.async("string")) as {
      files: Array<{ path: string; sha256: string }>;
    };

    expect(Object.keys(zip.files).filter((path) => !zip.files[path]?.dir).sort()).toEqual([
      "README.txt", "attachments/photo.jpg", "audit/events.json", "contract/final.pdf", "manifest.sha256.json", "signatures/signatures.json",
    ]);
    expect(manifest.files).toContainEqual(expect.objectContaining({
      path: "contract/final.pdf",
      sha256: createHash("sha256").update(contract).digest("hex"),
    }));
    expect(await zip.file("README.txt")!.async("string")).toContain("не является гарантией принятия");
  });
});
