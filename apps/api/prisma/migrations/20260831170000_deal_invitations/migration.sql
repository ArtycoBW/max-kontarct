-- Secure single-use invitations for Stage 4. Raw tokens are never persisted.
CREATE TABLE "deal_invitations" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "public_code" VARCHAR(24) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "accepted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "deal_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deal_invitations_public_code_key" ON "deal_invitations"("public_code");
CREATE UNIQUE INDEX "deal_invitations_token_hash_key" ON "deal_invitations"("token_hash");
CREATE INDEX "deal_invitations_deal_created_idx" ON "deal_invitations"("deal_id", "created_at");
CREATE INDEX "deal_invitations_expires_at_idx" ON "deal_invitations"("expires_at");
CREATE INDEX "deal_invitations_accepted_by_user_id_idx" ON "deal_invitations"("accepted_by_user_id");

-- Expired rows are revoked transactionally before a replacement is issued.
CREATE UNIQUE INDEX "deal_invitations_one_active_per_deal_idx"
ON "deal_invitations"("deal_id")
WHERE "revoked_at" IS NULL AND "accepted_at" IS NULL;

ALTER TABLE "deal_invitations"
ADD CONSTRAINT "deal_invitations_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_invitations"
ADD CONSTRAINT "deal_invitations_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deal_invitations"
ADD CONSTRAINT "deal_invitations_accepted_by_user_id_fkey"
FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal_invitations"
ADD CONSTRAINT "deal_invitations_lifecycle_check"
CHECK (
  NOT ("revoked_at" IS NOT NULL AND "accepted_at" IS NOT NULL)
  AND (("accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
    OR ("accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL))
  AND "expires_at" > "created_at"
);
