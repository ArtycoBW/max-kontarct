import { nativeDownloadResult } from "./native-download-result";

describe("nativeDownloadResult", () => {
  it.each(["downloading", "cancelled"] as const)("recognizes the documented %s status", status => {
    expect(nativeDownloadResult({ status })).toBe(status);
  });
  it.each([undefined, null, {}, true, "downloading", { status: "success" }, { status: "downloaded" }])("never treats an unknown response as success: %p", result => {
    expect(nativeDownloadResult(result)).toBe("unconfirmed");
  });
  it("rejects errors even when accompanied by a status", () => {
    expect(() => nativeDownloadResult({ status: "downloading", error: { code: "client.download_file.invalid_params" } })).toThrow();
  });
});
