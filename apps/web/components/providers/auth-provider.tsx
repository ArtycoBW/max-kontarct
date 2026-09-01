"use client";

import type { AuthUser } from "@max-contract/contracts";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import {
  authenticateDevelopment,
  authenticateWithMax,
  getCurrentSession,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { getMaxInitData, waitForMaxWebApp } from "@/lib/max/bridge";

interface AuthContextValue {
  error: Error | null;
  isPending: boolean;
  retry: () => void;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function bootstrapSession() {
  if (process.env.NODE_ENV === "production") {
    await waitForMaxWebApp();
  }

  try {
    return await getCurrentSession();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return authenticateDevelopment();
  }

  return authenticateWithMax(getMaxInitData());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const requiresSession = !pathname.startsWith("/invite/");
  const session = useQuery({
    enabled: requiresSession,
    queryFn: bootstrapSession,
    queryKey: queryKeys.auth.me(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  return (
    <AuthContext.Provider
      value={{
        error: requiresSession ? session.error : null,
        isPending: requiresSession && session.isPending,
        retry: () => void session.refetch(),
        user: requiresSession ? (session.data?.user ?? null) : null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
