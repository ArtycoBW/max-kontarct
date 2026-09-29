import { downloadFilename } from "./download-filename";

describe("native download filenames", () => {
  it("keeps readable short names and their extensions", () => {
    expect(downloadFilename("Договор.pdf")).toBe("Договор.pdf");
    expect(downloadFilename("Материалы.zip")).toBe("Материалы.zip");
  });
  it.each(["Договор".repeat(100) + ".pdf", "📊".repeat(100) + ".zip"])("bounds UTF-8 length without losing the extension", name => {
    const result = downloadFilename(name);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(100);
    expect(result.endsWith(name.slice(-4))).toBe(true);
    expect(result).not.toMatch(/[\uD800-\uDFFF]/u);
  });
  it("replaces control characters and path separators", () => {
    expect(downloadFilename("../папка\\договор\n:акт.pdf")).toBe("_папка_договор__акт.pdf");
    expect(downloadFilename("...")).toBe("document");
  });
});
