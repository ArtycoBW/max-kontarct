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
  normalization: {
    addressSuggestions: (query: string) => ["normalization", "address", query] as const,
  },
  trust: {
    current: () => ["trust", "current"] as const,
  },
  deals: {
    all: ["deals"] as const,
    detail: (dealId: string) => [...queryKeys.deals.all, "detail", dealId] as const,
    list: () => [...queryKeys.deals.all, "list"] as const,
    signing: (dealId: string) =>
      [...queryKeys.deals.all, "signing", dealId] as const,
    versions: (dealId: string) =>
      [...queryKeys.deals.all, "versions", dealId] as const,
    workspace: (dealId: string) =>
      [...queryKeys.deals.all, "workspace", dealId] as const,
  },
  files: {
    workspace: (dealId: string) => ["files", "workspace", dealId] as const,
  },
  templates: {
    all: ["templates"] as const,
    clarification: (sessionId: string) =>
      [...queryKeys.templates.all, "clarification", sessionId] as const,
    detail: (slug: string) => [...queryKeys.templates.all, "detail", slug] as const,
    generation: (sessionId: string) =>
      [...queryKeys.templates.all, "generation", sessionId] as const,
    list: () => [...queryKeys.templates.all, "list"] as const,
  },
  admin: {
    all: ["admin"] as const,
    aiGenerations: () => [...queryKeys.admin.all, "ai-generations"] as const,
    files: () => [...queryKeys.admin.all, "files"] as const,
    audit: () => [...queryKeys.admin.all, "audit"] as const,
    templates: () => [...queryKeys.admin.all, "templates"] as const,
    users: () => [...queryKeys.admin.all, "users"] as const,
  },
} as const;
