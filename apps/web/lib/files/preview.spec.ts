import { fetchPreview, fileSizeLabel, previewKind, type PreviewFile } from "./preview";

const file: PreviewFile = { id: "test", originalName: "Тест.pdf", mimeType: "application/pdf", sizeBytes: 100, url: "/api/v1/deals/test/files/test/content" };
afterEach(() => jest.restoreAllMocks());
test("only inert supported types can be previewed", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(previewKind(type)).toBe("image");
  expect(previewKind("application/pdf")).toBe("pdf");
  for (const type of ["text/html", "image/svg+xml", "application/javascript", "application/octet-stream"]) expect(previewKind(type)).toBe("unsupported");
  expect(fileSizeLabel(1024)).toBe("1 КБ");
  expect(fileSizeLabel(1048576)).toBe("1.0 МБ");
});
test("uses the authenticated endpoint without caching and propagates cancellation", async () => {
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("%PDF-", { headers: { "Content-Type": "application/pdf" } }));
  const controller = new AbortController();
  expect((await fetchPreview(file, controller.signal)).type).toBe("application/pdf");
  expect(fetch).toHaveBeenCalledWith(file.url, { credentials: "include", cache: "no-store", signal: controller.signal });
});
test.each([[401, "Сессия"], [403, "нет доступа"], [404, "не найден"], [500, "Не удалось"]])("explains HTTP %s without exposing server content", async (status, message) => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("internal data", { status: Number(status) }));
  await expect(fetchPreview(file, new AbortController().signal)).rejects.toThrow(String(message));
});
test("rejects login HTML and a mislabeled response", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<script></script>", { headers: { "Content-Type": "text/html" } }));
  await expect(fetchPreview(file, new AbortController().signal)).rejects.toThrow("Формат содержимого");
});
