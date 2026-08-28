export type AuthUserRole = "USER" | "ADMIN" | "SUPPORT";

export interface AuthMaxAccount {
  firstName: string | null;
  languageCode: string | null;
  lastName: string | null;
  maxUserId: string;
  username: string | null;
}

export interface AuthUser {
  id: string;
  maxAccount: AuthMaxAccount;
  role: AuthUserRole;
}

export interface AuthSessionResponse {
  user: AuthUser;
}

export interface MaxAuthRequest {
  initData: string;
}

export type ConsentType =
  | "PERSONAL_DATA"
  | "TERMS_OF_USE"
  | "STATUS_NOTIFICATIONS";

export interface ConsentStatus {
  granted: boolean;
  required: boolean;
  type: ConsentType;
  version: string;
}

export interface VerifiedPhone {
  e164: string;
  source: "MAX" | "DEV";
  verifiedAt: string;
}

export interface OnboardingStateResponse {
  completed: boolean;
  consents: ConsentStatus[];
  phone: VerifiedPhone | null;
  phoneVerified: boolean;
  requiredConsentsAccepted: boolean;
}

export interface RecordConsentsRequest {
  personalData: boolean;
  statusNotifications: boolean;
  termsOfUse: boolean;
}

export interface MaxContactRequest {
  authDate: string;
  hash: string;
  phone: string;
}

export interface UserProfileResponse {
  birthDate: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  maxUsername: string | null;
  middleName: string | null;
  phone: VerifiedPhone | null;
  updatedAt: string | null;
}

export interface UpdateUserProfileRequest {
  birthDate: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

export interface AdminUserListItem {
  createdAt: string;
  displayName: string;
  id: string;
  lastSeenAt: string | null;
  profileCompleted: boolean;
  role: AuthUserRole;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  total: number;
}

export interface AdminAuditEvent {
  actorUserId: string | null;
  createdAt: string;
  entityId: string | null;
  entityType: string | null;
  eventType: string;
  id: string;
  requestId: string | null;
}

export interface AdminAuditListResponse {
  items: AdminAuditEvent[];
  total: number;
}

export type ContractTemplateVersionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED";

export interface ContractTemplateVersionSummary {
  id: string;
  publishedAt: string;
  status: "PUBLISHED";
  versionNumber: number;
}

export interface ContractTemplateListItem {
  currentVersion: ContractTemplateVersionSummary;
  id: string;
  isDemo: boolean;
  slug: string;
  summary: string;
  title: string;
}

export interface ContractTemplateListResponse {
  items: ContractTemplateListItem[];
  total: number;
}

export interface TemplateDocumentRequirementResponse {
  description: string | null;
  id: string;
  key: string;
  required: boolean;
  sortOrder: number;
  title: string;
}

export interface ContractTemplateDetailsResponse
  extends ContractTemplateListItem {
  currentVersion: ContractTemplateVersionSummary & {
    documentRequirements: TemplateDocumentRequirementResponse[];
    questionnaireSchema: Record<string, unknown>;
  };
}
