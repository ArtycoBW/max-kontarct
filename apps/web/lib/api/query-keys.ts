export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
  },
  health: {
    all: ["health"] as const,
    ready: () => [...queryKeys.health.all, "ready"] as const,
  },
  onboarding: {
    all: ["onboarding"] as const,
    state: () => [...queryKeys.onboarding.all, "state"] as const,
  },
  profile: {
    all: ["profile"] as const,
    current: () => [...queryKeys.profile.all, "current"] as const,
  },
  templates: {
    all: ["templates"] as const,
    detail: (slug: string) => [...queryKeys.templates.all, "detail", slug] as const,
    list: () => [...queryKeys.templates.all, "list"] as const,
  },
  admin: {
    all: ["admin"] as const,
    audit: () => [...queryKeys.admin.all, "audit"] as const,
    users: () => [...queryKeys.admin.all, "users"] as const,
  },
} as const;
