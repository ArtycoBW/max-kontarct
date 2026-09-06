export function unsignedObjectUrl(endpoint: string, bucket: string, key: string, pathStyle: boolean): URL {
  const url = new URL(endpoint);
  if (!pathStyle) url.hostname = `${bucket}.${url.hostname}`;
  const parts = [...(pathStyle ? [bucket] : []), ...key.split("/")].map(encodeURIComponent);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${parts.join("/")}`;
  url.search = "";
  url.hash = "";
  return url;
}

// Call only after an authenticated HEAD has proved that the object exists.
export function isUnsignedReadBlocked(status: number): boolean {
  return status === 403 || status === 404;
}
