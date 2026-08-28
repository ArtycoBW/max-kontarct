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
