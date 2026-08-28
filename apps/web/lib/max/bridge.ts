"use client";

export function getMaxInitData(): string {
  if (typeof window === "undefined") {
    throw new Error("MAX Bridge недоступен на сервере");
  }

  const initData = window.WebApp?.initData?.trim();
  if (!initData) {
    throw new Error("Откройте приложение внутри MAX и повторите попытку");
  }

  return initData;
}
