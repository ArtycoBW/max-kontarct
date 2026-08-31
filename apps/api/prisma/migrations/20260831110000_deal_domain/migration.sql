-- CreateEnum
CREATE TYPE "deal_status" AS ENUM (
  'DRAFT',
  'COLLECTING_DATA',
  'INVITATION_READY',
  'INVITED',
  'COUNTERPARTY_JOINED',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_DRAFT',
  'TERMS_REVIEW',
  'READY_TO_SIGN',
  'SIGNED_BY_ONE',
  'SIGNED',
  'COMPLETED',
  'CANCELED'
);

-- CreateEnum
CREATE TYPE "deal_party_role" AS ENUM ('INITIATOR', 'COUNTERPARTY');

-- CreateEnum
CREATE TYPE "deal_approval_status" AS ENUM ('APPROVED', 'SUPERSEDED', 'REVOKED');

-- CreateTable
CREATE TABLE "deals" (
  "id" UUID NOT NULL,
  "initiator_user_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "status" "deal_status" NOT NULL DEFAULT 'DRAFT',
  "canceled_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_parties" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "deal_party_role" NOT NULL,
  "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "deal_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_versions" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "source_generation_id" UUID,
  "version_number" INTEGER NOT NULL,
  "terms" JSONB NOT NULL,
  "contract_draft" JSONB,
  "change_summary" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "deal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_approvals" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "deal_version_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "status" "deal_approval_status" NOT NULL DEFAULT 'APPROVED',
  "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "deal_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_initiator_status_updated_idx" ON "deals"("initiator_user_id", "status", "updated_at");
CREATE INDEX "deals_status_updated_idx" ON "deals"("status", "updated_at");
CREATE INDEX "deals_template_version_id_idx" ON "deals"("template_version_id");
CREATE UNIQUE INDEX "deal_parties_deal_role_key" ON "deal_parties"("deal_id", "role");
CREATE UNIQUE INDEX "deal_parties_deal_user_key" ON "deal_parties"("deal_id", "user_id");
CREATE UNIQUE INDEX "deal_parties_id_deal_id_key" ON "deal_parties"("id", "deal_id");
CREATE INDEX "deal_parties_user_joined_idx" ON "deal_parties"("user_id", "joined_at");
CREATE UNIQUE INDEX "deal_versions_source_generation_id_key" ON "deal_versions"("source_generation_id");
CREATE UNIQUE INDEX "deal_versions_deal_version_key" ON "deal_versions"("deal_id", "version_number");
CREATE UNIQUE INDEX "deal_versions_id_deal_id_key" ON "deal_versions"("id", "deal_id");
CREATE INDEX "deal_versions_deal_created_idx" ON "deal_versions"("deal_id", "created_at");
CREATE INDEX "deal_versions_created_by_user_id_idx" ON "deal_versions"("created_by_user_id");
CREATE UNIQUE INDEX "deal_approvals_version_party_key" ON "deal_approvals"("deal_version_id", "party_id");
CREATE INDEX "deal_approvals_party_status_idx" ON "deal_approvals"("party_id", "status");
CREATE INDEX "deal_approvals_version_status_idx" ON "deal_approvals"("deal_version_id", "status");

-- AddForeignKey
ALTER TABLE "deals"
ADD CONSTRAINT "deals_initiator_user_id_fkey"
FOREIGN KEY ("initiator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deals"
ADD CONSTRAINT "deals_template_version_id_fkey"
FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deal_parties"
ADD CONSTRAINT "deal_parties_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_parties"
ADD CONSTRAINT "deal_parties_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deal_versions"
ADD CONSTRAINT "deal_versions_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_versions"
ADD CONSTRAINT "deal_versions_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deal_versions"
ADD CONSTRAINT "deal_versions_source_generation_id_fkey"
FOREIGN KEY ("source_generation_id") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal_approvals"
ADD CONSTRAINT "deal_approvals_deal_version_id_fkey"
FOREIGN KEY ("deal_version_id", "deal_id") REFERENCES "deal_versions"("id", "deal_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_approvals"
ADD CONSTRAINT "deal_approvals_party_id_fkey"
FOREIGN KEY ("party_id", "deal_id") REFERENCES "deal_parties"("id", "deal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma's schema language.
ALTER TABLE "deals"
ADD CONSTRAINT "deals_title_not_blank"
CHECK (length(btrim("title")) > 0),
ADD CONSTRAINT "deals_terminal_status_timestamps"
CHECK (
  ("status" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "completed_at" IS NULL)
  OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "canceled_at" IS NULL)
  OR ("status" NOT IN ('CANCELED', 'COMPLETED') AND "canceled_at" IS NULL AND "completed_at" IS NULL)
);

ALTER TABLE "deal_versions"
ADD CONSTRAINT "deal_versions_positive_version"
CHECK ("version_number" > 0),
ADD CONSTRAINT "deal_versions_terms_object"
CHECK (jsonb_typeof("terms") = 'object'),
ADD CONSTRAINT "deal_versions_contract_draft_object"
CHECK ("contract_draft" IS NULL OR jsonb_typeof("contract_draft") = 'object'),
ADD CONSTRAINT "deal_versions_change_summary_not_blank"
CHECK ("change_summary" IS NULL OR length(btrim("change_summary")) > 0);

ALTER TABLE "deal_approvals"
ADD CONSTRAINT "deal_approvals_status_timestamp"
CHECK (
  ("status" = 'APPROVED' AND "invalidated_at" IS NULL)
  OR ("status" IN ('SUPERSEDED', 'REVOKED') AND "invalidated_at" IS NOT NULL)
);
