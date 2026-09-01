export type AuthUserRole = "USER" | "ADMIN" | "SUPPORT";

export type DealStatus =
  | "DRAFT"
  | "COLLECTING_DATA"
  | "INVITATION_READY"
  | "INVITED"
  | "COUNTERPARTY_JOINED"
  | "DOCUMENTS_PENDING"
  | "DOCUMENTS_REVIEW"
  | "CONTRACT_DRAFT"
  | "TERMS_REVIEW"
  | "READY_TO_SIGN"
  | "SIGNED_BY_ONE"
  | "SIGNED"
  | "COMPLETED"
  | "CANCELED";

export type DealPartyRole = "INITIATOR" | "COUNTERPARTY";

export type DealApprovalStatus = "APPROVED" | "SUPERSEDED" | "REVOKED";

export type DealCreationPath = "TEMPLATE" | "AI_ASSISTED";

export type DealDraftStep =
  | "DESCRIPTION"
  | "PARAMETERS"
  | "AI_CLARIFICATION"
  | "AI_GENERATION"
  | "INITIATOR";

export interface DealInitiatorSnapshot {
  email: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string;
}

export interface DealDraftData {
  answers: Record<string, unknown>;
  clarificationSessionId: string | null;
  creationPath: DealCreationPath;
  currentStep: DealDraftStep;
  description: string;
  initiator: DealInitiatorSnapshot | null;
}

export interface CreateDealDraftRequest {
  creationPath: DealCreationPath;
  description: string;
  templateVersionId: string;
  title: string;
}

export interface UpdateDealDraftRequest {
  answers?: Record<string, unknown>;
  clarificationSessionId?: string | null;
  creationPath?: DealCreationPath;
  currentStep?: DealDraftStep;
  description?: string;
  expectedUpdatedAt: string;
  sourceGenerationId?: string | null;
  title?: string;
}

export interface StartDealAgreementRequest {
  expectedUpdatedAt: string;
  expectedVersionId: string;
}

export interface CreateDealVersionRequest {
  answers: Record<string, unknown>;
  changeSummary: string;
  clarificationSessionId?: string | null;
  description: string;
  expectedUpdatedAt: string;
  expectedVersionId: string;
  sourceGenerationId: string;
}

export interface DealDraftResponse {
  contractDraft: ContractStructuredDraft | null;
  createdAt: string;
  draft: DealDraftData;
  id: string;
  sourceGenerationId: string | null;
  status: DealStatus;
  template: {
    slug: string;
    title: string;
    versionId: string;
    versionNumber: number;
  };
  title: string;
  updatedAt: string;
  versionId: string;
  versionNumber: number;
}

export interface DealListItem {
  id: string;
  status: DealStatus;
  templateTitle: string;
  title: string;
  updatedAt: string;
  versionNumber: number;
}

export type DealInvitationState =
  | "ACTIVE"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";

export interface PublicInvitationTerm {
  label: string;
  value: string;
}

export interface PublicDealInvitationResponse {
  botUsername: string;
  expiresAt: string;
  initiatorMaskedName: string;
  publicCode: string;
  state: DealInvitationState;
  templateSummary: string;
  templateTitle: string;
  terms: PublicInvitationTerm[];
  versionNumber: number;
  whatItGives: string[];
}

export interface CreateDealInvitationRequest {
  expectedUpdatedAt: string;
  expectedVersionId: string;
  replaceActive?: boolean;
}

export interface DealInvitationResponse {
  acceptedAt: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  maxDeeplink: string | null;
  publicCode: string;
  shareText: string | null;
  shareUrl: string | null;
  state: DealInvitationState;
}

export interface JoinDealInvitationRequest {
  publicCode: string;
  token: string;
}

export interface DealPartySummary {
  displayName: string;
  profileCompleted: boolean;
  role: DealPartyRole;
}

export interface DealWorkspaceResponse extends DealDraftResponse {
  approvals: {
    currentUserApproved: boolean;
    required: number;
    totalApproved: number;
  };
  counterparty: DealPartySummary | null;
  currentUserRole: DealPartyRole;
  initiator: DealPartySummary;
  invitation: Omit<DealInvitationResponse, "maxDeeplink" | "shareText" | "shareUrl"> | null;
}

export interface ApproveDealVersionRequest {
  expectedDealUpdatedAt: string;
}

export interface DealApprovalResponse {
  approvalId: string;
  approvedAt: string;
  dealStatus: DealStatus;
  dealUpdatedAt: string;
  totalApproved: number;
  versionId: string;
  versionNumber: number;
}

export interface PepAgreementResponse {
  documentHash: string;
  paragraphs: string[];
  title: string;
  version: string;
}

export interface DealSigningPartyStatus {
  displayName: string;
  isCurrentUser: boolean;
  role: DealPartyRole;
  signedAt: string | null;
}

export interface DealArtifactSummary {
  createdAt: string;
  downloadUrl: string;
  id: string;
  mimeType: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  type: "FINAL_PDF" | "EVIDENCE_ZIP";
}

export interface PublicDocumentVerificationResponse {
  contractNumber: string;
  documentStatus: "SIGNED" | "COMPLETED";
  integrity: "VALID" | "INVALID" | "UNAVAILABLE";
  sha256: string;
  signedAt: string;
}

export interface DealSigningStateResponse {
  contractNumber: string;
  currentUserSigned: boolean;
  dealId: string;
  documentHash: string;
  finalPdf: DealArtifactSummary | null;
  parties: DealSigningPartyStatus[];
  pepAgreement: PepAgreementResponse;
  requiredSignatures: number;
  status: DealStatus;
  totalSignatures: number;
  versionId: string;
  versionNumber: number;
}

export interface IssueSigningOtpRequest {
  pepAccepted: true;
  versionId: string;
}

export interface IssueSigningOtpResponse {
  channel: "FAKE" | "MAX_TEST" | "SMSC";
  expiresAt: string;
  maskedPhone: string;
  resendAvailableAt: string;
}

export interface ConfirmDealSignatureRequest {
  code: string;
  versionId: string;
}

export interface DealListResponse {
  items: DealListItem[];
  total: number;
}

export interface DealVersionApprovalSummary {
  approved: number;
  revoked: number;
  superseded: number;
}

export interface DealVersionListItem {
  approvals: DealVersionApprovalSummary;
  changeSummary: string | null;
  createdAt: string;
  id: string;
  isCurrent: boolean;
  versionNumber: number;
}

export interface DealVersionListResponse {
  items: DealVersionListItem[];
  total: number;
}

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
  address: NormalizedAddress | null;
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
  address: NormalizedAddress | null;
  birthDate: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

export interface AddressSuggestion {
  city: string | null;
  fiasId: string | null;
  house: string | null;
  postalCode: string | null;
  region: string | null;
  street: string | null;
  unrestrictedValue: string;
  value: string;
}

export interface AddressSuggestionListResponse {
  items: AddressSuggestion[];
}

export interface NormalizeAddressRequest {
  address: string;
}

export interface NormalizedAddress {
  city: string | null;
  fiasId: string | null;
  house: string | null;
  kladrId: string | null;
  postalCode: string | null;
  qualityCode: string | null;
  region: string | null;
  source: "DADATA" | "MOCK";
  street: string | null;
  value: string;
}

export type TrustCheckType =
  | "MAX_ACCOUNT"
  | "PHONE"
  | "REQUISITES_FORMAT"
  | "REQUIRED_FILES"
  | "INTERNAL_REVIEW";

export type TrustCheckStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export type TrustCheckSource =
  | "MAX"
  | "DEV"
  | "PROFILE"
  | "DADATA"
  | "FILES"
  | "ADMIN"
  | "SYSTEM";

export interface UserTrustCheckResponse {
  checkedAt: string | null;
  source: TrustCheckSource;
  status: TrustCheckStatus;
  type: TrustCheckType;
  updatedAt: string;
}

export interface UserTrustStatusResponse {
  checks: UserTrustCheckResponse[];
  confirmed: number;
  total: number;
}

export type DealFileCategory = "REQUIREMENT" | "EVIDENCE";
export type DealFileVisibility = "OWNER_ONLY" | "DEAL_PARTICIPANTS";
export type DealFileReviewStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface DealFileResponse {
  category: DealFileCategory;
  id: string;
  mimeType: string;
  originalName: string;
  owner: {
    displayName: string;
    isCurrentUser: boolean;
  };
  requirementId: string | null;
  reviewComment: string | null;
  reviewStatus: DealFileReviewStatus;
  sha256: string;
  sizeBytes: number;
  uploadedAt: string;
  visibility: DealFileVisibility;
}

export interface DealDocumentRequirementResponse {
  description: string | null;
  id: string;
  required: boolean;
  title: string;
  uploads: DealFileResponse[];
}

export interface DealDocumentsWorkspaceResponse {
  allowedMimeTypes: string[];
  dealId: string;
  dealStatus: DealStatus;
  dealTitle: string;
  evidenceFiles: DealFileResponse[];
  maxUploadBytes: number;
  requirements: DealDocumentRequirementResponse[];
}

export interface UploadDealFileRequest {
  category: DealFileCategory;
  requirementId?: string;
}

export interface AdminFileReviewItem {
  dealId: string;
  dealTitle: string;
  id: string;
  mimeType: string;
  originalName: string;
  ownerDisplayName: string;
  requirementTitle: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewStatus: DealFileReviewStatus;
  sizeBytes: number;
  uploadedAt: string;
  visibility: DealFileVisibility;
}

export interface AdminFileReviewListResponse {
  items: AdminFileReviewItem[];
  total: number;
}

export interface ReviewDealFileRequest {
  comment: string | null;
  status: Exclude<DealFileReviewStatus, "PENDING">;
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

export interface AdminTemplateVersion {
  archivedAt: string | null;
  createdAt: string;
  documentRequirements: TemplateDocumentRequirementResponse[];
  id: string;
  publishedAt: string | null;
  questionnaireSchema: Record<string, unknown>;
  status: ContractTemplateVersionStatus;
  updatedAt: string;
  versionNumber: number;
}

export interface AdminContractTemplate {
  createdAt: string;
  id: string;
  isDemo: boolean;
  slug: string;
  summary: string;
  title: string;
  updatedAt: string;
  versions: AdminTemplateVersion[];
}

export interface AdminTemplateListResponse {
  items: AdminContractTemplate[];
  total: number;
}

export interface AdminTemplateDocumentRequirementInput {
  description: string | null;
  key: string;
  required: boolean;
  sortOrder: number;
  title: string;
}

export interface UpdateAdminTemplateVersionRequest {
  documentRequirements?: AdminTemplateDocumentRequirementInput[];
  questionnaireSchema?: Record<string, unknown>;
}

export interface AdminAiGenerationMetadata {
  attemptCount: number;
  completedAt: string | null;
  createdAt: string;
  failedAt: string | null;
  failureCode: string | null;
  id: string;
  model: string | null;
  promptId: string;
  promptVersion: string;
  provider: string | null;
  queuedAt: string | null;
  redactedPiiCount: number | null;
  startedAt: string | null;
  status: AiGenerationStatus;
  templateTitle: string;
  templateVersion: number;
  totalTokens: number | null;
  updatedAt: string;
}

export interface AdminAiGenerationListResponse {
  items: AdminAiGenerationMetadata[];
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

export interface TemplateAnswerValidationError {
  message: string;
  path: string;
}

export interface ValidateTemplateAnswersRequest {
  answers: Record<string, unknown>;
  templateVersionId: string;
}

export interface TemplateVersionSnapshot {
  documentRequirements: TemplateDocumentRequirementResponse[];
  questionnaireSchema: Record<string, unknown>;
  templateId: string;
  templateSlug: string;
  templateTitle: string;
  templateVersionId: string;
  versionNumber: number;
}

export interface ValidateTemplateAnswersResponse {
  answers: Record<string, unknown>;
  snapshot: TemplateVersionSnapshot;
  valid: true;
}

export type AiClarificationStatus =
  | "NEED_MORE_INFO"
  | "READY_TO_GENERATE";

export type AiGenerationStatus =
  | AiClarificationStatus
  | "QUEUED"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED";

export type AiClarificationQuestionType =
  | "single_choice"
  | "boolean"
  | "short_text"
  | "number"
  | "date";

export interface AiClarificationOption {
  label: string;
  value: string;
}

export interface AiClarificationQuestion {
  description: string;
  id: string;
  label: string;
  options: AiClarificationOption[];
  required: boolean;
  type: AiClarificationQuestionType;
}

export interface StartAiClarificationRequest {
  answers: Record<string, unknown>;
  templateVersionId: string;
}

export interface AnswerAiClarificationRequest {
  answers: Record<string, unknown>;
}

export interface AiClarificationSessionResponse {
  answers: Record<string, unknown>;
  createdAt: string;
  id: string;
  questions: AiClarificationQuestion[];
  status: AiClarificationStatus;
  updatedAt: string;
}

export type ContractGenerationStatus =
  | "QUEUED"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED";

export interface ContractDraftSection {
  clauses: string[];
  heading: string;
}

export interface ContractStructuredDraft {
  preamble: string;
  sections: ContractDraftSection[];
  title: string;
  warnings: string[];
}

export interface ContractGenerationResponse {
  createdAt: string;
  draft: ContractStructuredDraft | null;
  errorMessage: string | null;
  id: string;
  progress: number;
  status: ContractGenerationStatus;
  updatedAt: string;
}
