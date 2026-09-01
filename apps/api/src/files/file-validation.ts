import { BadRequestException } from "@nestjs/common";

export const ALLOWED_FILE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function validateUploadedFile(
  file: Express.Multer.File,
  maxBytes: number,
): { mimeType: string; originalName: string } {
  if (!file.buffer?.length) throw invalidFile("Выберите непустой файл");
  if (file.buffer.length > maxBytes) {
    throw invalidFile(`Размер файла превышает ${formatMegabytes(maxBytes)}`);
  }
  const mimeType = detectMimeType(file.buffer);
  const declared = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
  if (!mimeType || mimeType !== declared) {
    throw invalidFile("Формат файла не соответствует его содержимому");
  }
  const originalName = sanitizeFilename(file.originalname);
  if (!originalName) throw invalidFile("У файла должно быть корректное название");
  return { mimeType, originalName };
}

export function detectMimeType(body: Buffer): string | null {
  if (body.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (body.length >= 12
    && body.subarray(0, 4).toString("ascii") === "RIFF"
    && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function sanitizeFilename(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code < 32 || code === 127
        ? "_"
        : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function invalidFile(message: string): BadRequestException {
  return new BadRequestException({ code: "FILE_INVALID", message });
}

function formatMegabytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024 / 1024)} МБ`;
}
