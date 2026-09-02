import { createHash } from "node:crypto";

import JSZip from "jszip";

export interface EvidencePackageFile {
  body: Buffer;
  mimeType: string;
  path: string;
}

export interface EvidencePackageInput {
  auditEvents: unknown[];
  contract: EvidencePackageFile;
  createdAt: Date;
  files: EvidencePackageFile[];
  signatures: unknown[];
}

export interface EvidenceManifestEntry {
  mimeType: string;
  path: string;
  sha256: string;
  sizeBytes: number;
}

export async function buildEvidencePackage(input: EvidencePackageInput): Promise<Buffer> {
  const zip = new JSZip();
  const manifest: EvidenceManifestEntry[] = [];
  const add = (file: EvidencePackageFile) => {
    zip.file(file.path, file.body, { binary: true, date: input.createdAt });
    manifest.push({
      mimeType: file.mimeType,
      path: file.path,
      sha256: createHash("sha256").update(file.body).digest("hex"),
      sizeBytes: file.body.length,
    });
  };
  add(input.contract);
  input.files.forEach(add);
  add(jsonFile("audit/events.json", input.auditEvents));
  add(jsonFile("signatures/signatures.json", input.signatures));
  add({
    body: Buffer.from([
      "Материалы сделки «Макс-Контракт».",
      "",
      "В архиве — подписанный договор в PDF, общие вложения, история сделки и сведения об электронных подписях.",
      "Файл manifest.sha256.json содержит контрольные суммы для проверки целостности файлов архива.",
      "Личные документы, доступные только их владельцу, в общий архив не включены.",
    ].join("\n"), "utf8"),
    mimeType: "text/plain; charset=utf-8",
    path: "README.txt",
  });
  const ordered = [...manifest].sort((left, right) => left.path.localeCompare(right.path, "en"));
  zip.file("manifest.sha256.json", JSON.stringify({ algorithm: "SHA-256", files: ordered, version: 1 }, null, 2), { date: input.createdAt });
  return zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
    type: "nodebuffer",
  });
}

function jsonFile(path: string, value: unknown): EvidencePackageFile {
  return { body: Buffer.from(JSON.stringify(value, null, 2), "utf8"), mimeType: "application/json", path };
}
