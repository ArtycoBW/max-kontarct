"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import { isPublicRoute } from "@/lib/routing/public-routes";

import { AuthProvider } from "./auth-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {process.env.NODE_ENV === "production" && !isPublicRoute(pathname) ? <Script src="https://st.max.ru/js/max-web-app.js" strategy="afterInteractive" /> : null}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
