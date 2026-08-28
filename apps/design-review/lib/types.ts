export type ConceptSlug = "jeton" | "caldera" | "contractbook" | "auros";

export type ScreenId =
  | "splash"
  | "welcome"
  | "consents"
  | "phone"
  | "dashboard"
  | "dashboard-empty"
  | "deal-type"
  | "deal-description"
  | "deal-parameters"
  | "ai-questions"
  | "ai-generation"
  | "initiator-data"
  | "counterparty-data"
  | "invitation"
  | "invitation-waiting"
  | "counterparty-connected"
  | "required-documents"
  | "document-upload"
  | "upload-success"
  | "evidence-files"
  | "verification-status"
  | "warnings"
  | "contract-preview"
  | "contract-full"
  | "terms-approval"
  | "ready-to-sign"
  | "pep-agreement"
  | "otp"
  | "signed-by-one-party"
  | "completed"
  | "deal-card"
  | "deal-timeline"
  | "deal-documents"
  | "pdf-viewer"
  | "profile"
  | "saved-requisites"
  | "settings"
  | "loading"
  | "error"
  | "empty-state"
  | "success-state"
  | "expired-link"
  | "no-access";

export type ScreenGroup =
  | "Онбординг"
  | "Создание сделки"
  | "Стороны и приглашение"
  | "Документы и проверка"
  | "Договор и согласование"
  | "Подписание"
  | "После сделки"
  | "Профиль"
  | "Состояния";

export interface ScreenDefinition {
  id: ScreenId;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  group: ScreenGroup;
  kind: "main" | "state";
}

export interface ConceptDefinition {
  slug: ConceptSlug;
  number: string;
  name: string;
  label: string;
  character: string;
  summary: string;
  detail: string;
  primary: string;
  background: string;
  preview: string;
  references: string[];
}
