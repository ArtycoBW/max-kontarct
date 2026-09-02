import { isPublicRoute } from "./public-routes";

describe("public pages are independent from MAX auth and SDK", () => {
  it.each(["/verify/mztAbphvmERju9YOgHcr", "/invite/AbCdEfGhIjKl"])("does not bootstrap MAX on %s", (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });
  it.each(["/", "/admin"])("preserves auth on %s", (path) => {
    expect(isPublicRoute(path)).toBe(false);
  });
});
