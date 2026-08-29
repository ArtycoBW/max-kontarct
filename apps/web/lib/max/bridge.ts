"use client";

import type { MaxContactRequest } from "@max-contract/contracts";

export type MaxContactBridgeResult =
  | { kind: "development" }
  | { contact: MaxContactRequest; kind: "max" };

export class MaxContactBridgeError extends Error {
  constructor(
    readonly reason: "refused" | "request" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "MaxContactBridgeError";
  }
}

const MAX_BRIDGE_POLL_INTERVAL_MS = 25;
const MAX_BRIDGE_TIMEOUT_MS = 5_000;

export function waitForMaxWebApp(
  timeoutMs = MAX_BRIDGE_TIMEOUT_MS,
): Promise<MaxWebApp> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Не удалось связаться с MAX"));
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const checkBridge = (): void => {
      const webApp = window.WebApp;
      if (webApp) {
        resolve(webApp);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Откройте приложение внутри MAX и повторите попытку"));
        return;
      }

      window.setTimeout(checkBridge, MAX_BRIDGE_POLL_INTERVAL_MS);
    };

    checkBridge();
  });
}

export function getMaxInitData(): string {
  if (typeof window === "undefined") {
    throw new Error("Не удалось связаться с MAX");
  }

  const initData = window.WebApp?.initData?.trim();
  if (!initData) {
    throw new Error("Откройте приложение внутри MAX и повторите попытку");
  }

  return initData;
}

export async function requestMaxContact(): Promise<MaxContactBridgeResult> {
  if (process.env.NODE_ENV !== "production") {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const scenario = new URLSearchParams(window.location.search).get(
      "maxContactMock",
    );
    if (scenario === "refused") {
      throw new MaxContactBridgeError(
        "refused",
        "Вы решили не делиться номером",
      );
    }
    if (scenario === "request_error") {
      throw new MaxContactBridgeError(
        "request",
        "MAX не смог передать номер. Проверьте соединение и повторите попытку",
      );
    }
    return { kind: "development" };
  }

  const webApp = typeof window === "undefined" ? undefined : window.WebApp;
  if (!webApp?.requestContact) {
    throw new MaxContactBridgeError(
      "unavailable",
      "Обновите MAX и снова откройте мини-приложение",
    );
  }

  try {
    const contact = await webApp.requestContact();
    if ("error" in contact) {
      throw contact;
    }
    if (!contact?.authDate || !contact.hash || !contact.phone) {
      throw new MaxContactBridgeError(
        "request",
        "MAX не передал данные телефона",
      );
    }
    return { contact, kind: "max" };
  } catch (error) {
    if (error instanceof MaxContactBridgeError) {
      throw error;
    }

    const code = readBridgeErrorCode(error);
    if (code.includes("user_refused_provide_phone_number")) {
      throw new MaxContactBridgeError(
        "refused",
        "Вы решили не делиться номером",
      );
    }
    throw new MaxContactBridgeError(
      "request",
      "MAX не смог передать номер. Проверьте соединение и повторите попытку",
    );
  }
}

function readBridgeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if (
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "code" in error.error &&
    typeof error.error.code === "string"
  ) {
    return error.error.code;
  }

  return "";
}
