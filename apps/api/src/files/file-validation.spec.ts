import { BadRequestException } from "@nestjs/common";

import {
  detectMimeType,
  normalizeUploadedFilename,
  validateUploadedFile,
} from "./file-validation";

describe("file validation", () => {
  it.each([
    [Buffer.from("%PDF-1.7"), "application/pdf"],
    [Buffer.from([0xff, 0xd8, 0xff, 0x01]), "image/jpeg"],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    [Buffer.from("RIFF0000WEBP"), "image/webp"],
  ])("detects content signatures", (body, expected) => {
    expect(detectMimeType(body)).toBe(expected);
  });

  it("rejects spoofed MIME types", () => {
    expect(() => validateUploadedFile({
      buffer: Buffer.from("not a pdf"),
      mimetype: "application/pdf",
      originalname: "document.pdf",
      size: 9,
    } as Express.Multer.File, 1024)).toThrow(BadRequestException);
  });

  it("rejects files above the configured limit", () => {
    expect(() => validateUploadedFile({
      buffer: Buffer.from("%PDF-1.7"),
      mimetype: "application/pdf",
      originalname: "document.pdf",
      size: 8,
    } as Express.Multer.File, 4)).toThrow("Размер файла превышает");
  });

  it("restores a UTF-8 Cyrillic filename decoded as latin1 by multipart", () => {
    const original = "Договор аренды.pdf";
    const mojibake = Buffer.from(original, "utf8").toString("latin1");
    expect(normalizeUploadedFilename(mojibake)).toBe(original);
  });

  it("keeps an already valid Cyrillic filename unchanged", () => {
    expect(normalizeUploadedFilename("Акт осмотра.pdf")).toBe("Акт осмотра.pdf");
  });
});
