export const queryKeys = {
  health: {
    all: ["health"] as const,
    ready: () => [...queryKeys.health.all, "ready"] as const,
  },
} as const;
