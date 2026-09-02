export function isPublicRoute(pathname: string): boolean {
  return pathname.startsWith("/invite/") || pathname.startsWith("/verify/");
}
