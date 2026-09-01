import { createHash } from "node:crypto";

import type { PepAgreementResponse } from "@max-contract/contracts";

const PARAGRAPHS = [
  "Я подтверждаю, что использую подтверждённый номер телефона лично и действую от своего имени.",
  "Ввод одноразового кода означает подписание указанной версии договора простой электронной подписью.",
  "Подпись относится только к версии и SHA-256, показанным перед отправкой кода. Изменение условий потребует нового согласования и новой подписи.",
];

export function pepAgreement(version: string): PepAgreementResponse {
  const documentHash = createHash("sha256")
    .update(JSON.stringify({ paragraphs: PARAGRAPHS, title: "Соглашение о простой электронной подписи", version }))
    .digest("hex");
  return {
    documentHash,
    paragraphs: [...PARAGRAPHS],
    title: "Соглашение о простой электронной подписи",
    version,
  };
}
