import type { AuthUser } from "@max-contract/contracts";
import type { Request } from "express";

export interface VerifiedMaxUser {
  firstName: string;
  languageCode: string | null;
  lastName: string | null;
  maxUserId: string;
  username: string | null;
}

export interface VerifiedMaxLaunch {
  authDate: number;
  expiresAt: number;
  queryId: string;
  user: VerifiedMaxUser;
}

export interface AuthSessionContext {
  sessionHash: string;
  sessionId: string;
  user: AuthUser;
}

export type AuthenticatedRequest = Request & {
  auth: AuthSessionContext;
  id?: string;
};

export type RequestWithId = Request & { id?: string };
