import { downloadMetadata } from "./download-metadata";

describe("native download metadata", () => {
  it("uses a short ASCII name for MAX while preserving the browser's Cyrillic name", () => {
    const name = "Договор-МК-20260929-5845D2A0-V1.pdf";
    const result = downloadMetadata(name, "application/pdf");
    expect(result.nativeFilename).toBe("Dogovor-MK-20260929-5845D2A0-V1.pdf");
    expect(result.nativeDisposition).toBe('attachment; filename="Dogovor-MK-20260929-5845D2A0-V1.pdf"');
    expect(result.browserDisposition).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  });
  it.each([["application/pdf", "pdf"], ["application/zip", "zip"], ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["unknown/type", "bin"]])("uses %s for the native extension instead of trusting the supplied name", (mime, ext) => {
    expect(downloadMetadata("Договор.exe", mime).nativeFilename).toBe(`Dogovor.${ext}`);
  });
  it.each(["😀".repeat(100) + ".pdf", "CON.pdf", "../../Отчёт\r\nInjected: yes\".pdf", "Длинное имя ".repeat(100) + ".pdf", "" ])("produces a bounded, path- and header-safe ASCII name: %p", name => {
    const result = downloadMetadata(name, "application/pdf");
    expect(result.nativeFilename).toMatch(/^[a-zA-Z0-9_-]+\.pdf$/);
    expect(result.nativeFilename.length).toBeLessThanOrEqual(100);
    expect(result.nativeFilename).not.toBe("CON.pdf");
    expect(result.browserDisposition).not.toMatch(/[\r\n]/);
  });
  it("escapes RFC 5987 special characters in the original name", () => {
    expect(downloadMetadata("Файл'(1)*.pdf", "application/pdf").browserDisposition).toContain("%27%281%29%2A.pdf");
  });
});
