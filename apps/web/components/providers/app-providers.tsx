"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import { enableMaxClosingConfirmation, notifyMaxWebAppReady } from "@/lib/max/bridge";
import { reportBootStage } from "@/lib/diagnostics/boot-client";
import { isPublicRoute } from "@/lib/routing/public-routes";

import { AuthProvider } from "./auth-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const useMaxBridge = process.env.NODE_ENV === "production" && !isPublicRoute(pathname);
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

  useEffect(() => {
    if (useMaxBridge) {
      reportBootStage("react-mounted");
      notifyMaxWebAppReady();
    }
  }, [useMaxBridge]);

  useEffect(() => {
    if (isPublicRoute(pathname)) return;
    // MAX controls its own X/back gesture; the browser controls tab/reload confirmation.
    const protectClose = () => { enableMaxClosingConfirmation(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    protectClose();
    const retry = window.setInterval(protectClose, 1_000);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.clearInterval(retry); window.removeEventListener("beforeunload", beforeUnload); };
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      {useMaxBridge ? (
        <Script
          src="https://st.max.ru/js/max-web-app.js"
          strategy="afterInteractive"
          onReady={() => { reportBootStage("sdk-ready"); notifyMaxWebAppReady(); }}
          onError={() => { reportBootStage("sdk-error"); }}
        />
      ) : null}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
