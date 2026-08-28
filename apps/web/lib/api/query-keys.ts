export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
  },
  health: {
    all: ["health"] as const,
    ready: () => [...queryKeys.health.all, "ready"] as const,
  },
} as const;
