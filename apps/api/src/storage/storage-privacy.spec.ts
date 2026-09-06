import { isUnsignedReadBlocked, unsignedObjectUrl } from "./storage-privacy";

describe("S3 privacy probe", () => {
  it.each([200, 206, 301, 302, 307, 500])("does not mistake HTTP %s for private storage", status => {
    expect(isUnsignedReadBlocked(status)).toBe(false);
  });
  it.each([403, 404])("accepts explicit denial for an existing object: %s", status => {
    expect(isUnsignedReadBlocked(status)).toBe(true);
  });
  it("encodes keys without turning filename characters into URL parameters", () => {
    expect(unsignedObjectUrl("https://s3.example.test", "bucket", "private/a b?#.pdf", true).href).toBe("https://s3.example.test/bucket/private/a%20b%3F%23.pdf");
  });
  it("supports virtual-host style and never adds credentials or signatures", () => {
    const url = unsignedObjectUrl("https://s3.example.test", "bucket", "private/file.pdf", false);
    expect(url.href).toBe("https://bucket.s3.example.test/private/file.pdf");
    expect(url.search).toBe("");
  });
});
