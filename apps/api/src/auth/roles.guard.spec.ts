import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Reflector } from "@nestjs/core";

import { RolesGuard } from "./roles.guard";

function contextFor(role: UserRole): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function handler() {},
    switchToHttp: () => ({
      getRequest: () => ({ auth: { user: { role } } }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it.each([UserRole.ADMIN, UserRole.SUPPORT])(
    "allows the %s role",
    (role) => {
      const reflector = {
        getAllAndOverride: jest.fn(() => [UserRole.ADMIN, UserRole.SUPPORT]),
      } as unknown as Reflector;

      expect(new RolesGuard(reflector).canActivate(contextFor(role))).toBe(
        true,
      );
    },
  );

  it("rejects a regular user", () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => [UserRole.ADMIN, UserRole.SUPPORT]),
    } as unknown as Reflector;

    expect(() =>
      new RolesGuard(reflector).canActivate(contextFor(UserRole.USER)),
    ).toThrow(ForbiddenException);
  });

  it("does not restrict handlers without role metadata", () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => undefined),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(contextFor(UserRole.USER)),
    ).toBe(true);
  });
});
