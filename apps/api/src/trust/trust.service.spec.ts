/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { TrustCheckSource, TrustCheckStatus, TrustCheckType } from "@prisma/client";

import { TrustService } from "./trust.service";

const now = new Date("2026-09-01T10:00:00.000Z");

describe("TrustService", () => {
  it("stores and returns five independent trust levels", async () => {
    const stored = new Map<TrustCheckType, any>();
    const prisma: any = {
      $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(prisma)),
      user: {
        findUnique: jest.fn(async () => ({
          maxAccount: { id: "max" },
          phones: [{ source: "MAX" }],
          profile: {
            addressSource: "DADATA",
            addressValue: "г Москва, ул Тверская, д 1",
            birthDate: now,
            firstName: "Иван",
            lastName: "Иванов",
          },
        })),
      },
      userTrustCheck: {
        findMany: jest.fn(async () => [...stored.values()]),
        findUnique: jest.fn(async ({ where }: any) => stored.get(where.userId_type.type) ?? null),
        upsert: jest.fn(async ({ create, update, where }: any) => {
          const type = where.userId_type.type as TrustCheckType;
          const current = stored.get(type);
          const value = {
            checkedAt: null,
            createdAt: now,
            id: type,
            updatedAt: now,
            ...(current ?? create),
            ...update,
            type,
          };
          stored.set(type, value);
          return value;
        }),
      },
    };

    const result = await new TrustService(prisma).getStatus("user-id");

    expect(result.total).toBe(5);
    expect(result.confirmed).toBe(3);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: TrustCheckSource.MAX,
        status: TrustCheckStatus.CONFIRMED,
        type: TrustCheckType.MAX_ACCOUNT,
      }),
      expect.objectContaining({
        source: TrustCheckSource.DADATA,
        status: TrustCheckStatus.CONFIRMED,
        type: TrustCheckType.REQUISITES_FORMAT,
      }),
      expect.objectContaining({
        status: TrustCheckStatus.PENDING,
        type: TrustCheckType.INTERNAL_REVIEW,
      }),
    ]));
  });
});
