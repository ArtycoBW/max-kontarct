import type { ContractStructuredDraft } from "@max-contract/contracts";

export const CONTRACT_GENERATION_QUEUE = "contract-generation";
export const CONTRACT_GENERATION_JOB = "generate-contract-draft";

export interface ContractGenerationJobData {
  generationId: string;
}

export type StoredContractDraft = ContractStructuredDraft;
