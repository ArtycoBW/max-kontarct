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
import { isPublicRoute } from "@/lib/routing/public-routes";
import { reportBootStage } from "@/lib/diagnostics/boot-client";
import type { BootDetail } from "@/lib/diagnostics/boot-schema";

interface AuthContextValue {
  error: Error | null;
  isPending: boolean;
  retry: () => void;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadSession() {
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

async function bootstrapSession() {
  reportBootStage("auth-start");
  try {
    const session = await loadSession();
    reportBootStage("auth-success");
    return session;
  } catch (error) {
    let detail: BootDetail = "other";
    if (error instanceof ApiError) {
      detail = error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : error.status === 429 ? "rate-limited" : error.status === 504 ? "timeout" : error.status >= 500 ? "server-error" : "other";
    } else if (error instanceof TypeError) detail = "network";
    reportBootStage("auth-error", detail);
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const requiresSession = !isPublicRoute(pathname);
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
