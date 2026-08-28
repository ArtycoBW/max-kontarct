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
