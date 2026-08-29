import { Injectable } from "@nestjs/common";

import type { AiJsonObject, AiJsonValue } from "./ai-provider";

const SENSITIVE_KEYS = new Set([
  "address",
  "birthdate",
  "dateofbirth",
  "email",
  "firstname",
  "fio",
  "fullname",
  "inn",
  "lastname",
  "middlename",
  "passport",
  "passportnumber",
  "phone",
  "phonenumber",
  "snils",
]);

const INLINE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "EMAIL",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    label: "PHONE",
    pattern: /(?:\+7|8)(?:[\s()-]*\d){10}\b/g,
  },
  {
    label: "SNILS",
    pattern: /\b\d{3}-?\d{3}-?\d{3}[\s-]?\d{2}\b/g,
  },
  {
    label: "PASSPORT",
    pattern: /\b\d{4}\s?\d{6}\b/g,
  },
];

export interface RedactedAiData {
  data: AiJsonObject;
  redactedCount: number;
}

@Injectable()
export class PiiRedactor {
  redact(data: AiJsonObject, explicitPaths: string[] = []): RedactedAiData {
    const paths = new Set(explicitPaths.map(normalizePath));
    let redactedCount = 0;

    const visit = (value: AiJsonValue, path: string[]): AiJsonValue => {
      const normalizedPath = normalizePath(path.join("."));
      const key = normalizeKey(path.at(-1) ?? "");
      if (paths.has(normalizedPath) || SENSITIVE_KEYS.has(key)) {
        redactedCount += 1;
        return placeholder(path);
      }

      if (typeof value === "string") {
        let result = value;
        for (const { label, pattern } of INLINE_PATTERNS) {
          result = result.replace(pattern, () => {
            redactedCount += 1;
            return `{{PII:${label}}}`;
          });
        }
        return result;
      }

      if (Array.isArray(value)) {
        return value.map((item, index) => visit(item, [...path, String(index)]));
      }

      if (isJsonObject(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([childKey, childValue]) => [
            childKey,
            visit(childValue, [...path, childKey]),
          ]),
        );
      }

      return value;
    };

    return { data: visit(data, []) as AiJsonObject, redactedCount };
  }
}

function placeholder(path: string[]): string {
  const label = path
    .filter((part) => !/^\d+$/.test(part))
    .map((part) => part.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase())
    .filter(Boolean)
    .join("_");
  return `{{PII:${label || "VALUE"}}}`;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizePath(value: string): string {
  return value.trim().toLowerCase();
}

function isJsonObject(value: AiJsonValue): value is AiJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
