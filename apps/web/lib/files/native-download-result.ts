export type NativeDownloadResult = "downloading" | "cancelled" | "unconfirmed";

// MAX documents initiation/cancellation, not completion on the device:
// https://dev.max.ru/docs/webapps/bridge (downloadFile).
export function nativeDownloadResult(result: unknown): NativeDownloadResult {
  if (!result || typeof result !== "object") return "unconfirmed";
  if ("error" in result) throw new Error("Native download failed");
  if ("status" in result && (result.status === "downloading" || result.status === "cancelled")) return result.status;
  return "unconfirmed";
}
