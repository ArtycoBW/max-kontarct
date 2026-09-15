import { validateUploadCandidate } from "./files";

const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const maxBytes = 20 * 1024 * 1024;

describe("validateUploadCandidate", () => {
  it("explains an oversized file without a permanent numeric limit label", () => {
    expect(validateUploadCandidate(
      { name: "large.pdf", size: maxBytes + 1, type: "application/pdf" },
      maxBytes,
      allowed,
    )).toMatchObject({ title: "Файл слишком большой" });
  });

  it("explains supported formats", () => {
    expect(validateUploadCandidate(
      { name: "document.docx", size: 1024, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      maxBytes,
      allowed,
    )).toEqual({
      description: "Можно загрузить PDF, JPEG, PNG или WebP.",
      title: "Неподдерживаемый формат файла",
    });
  });

  it("rejects empty files before the network request", () => {
    expect(validateUploadCandidate(
      { name: "empty.pdf", size: 0, type: "application/pdf" },
      maxBytes,
      allowed,
    )).toMatchObject({ title: "Файл пустой" });
  });

  it("accepts a valid upload candidate", () => {
    expect(validateUploadCandidate(
      { name: "document.pdf", size: 1024, type: "application/pdf" },
      maxBytes,
      allowed,
    )).toBeNull();
  });
});
