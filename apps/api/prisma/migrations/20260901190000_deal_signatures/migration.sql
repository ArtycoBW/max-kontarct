CREATE TABLE "deal_signatures" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "deal_version_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "verified_phone_id" UUID NOT NULL,
  "max_user_id_ref" VARCHAR(128),
  "pep_document_version" VARCHAR(64) NOT NULL,
  "document_hash" CHAR(64) NOT NULL,
  "otp_channel" VARCHAR(16) NOT NULL,
  "provider_message_id" VARCHAR(128),
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_signatures_document_hash_check" CHECK ("document_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "deal_signatures_otp_channel_check" CHECK ("otp_channel" IN ('FAKE', 'MAX_TEST', 'SMSC'))
);

CREATE UNIQUE INDEX "deal_signatures_version_party_key"
  ON "deal_signatures"("deal_version_id", "party_id");
CREATE INDEX "deal_signatures_deal_signed_idx"
  ON "deal_signatures"("deal_id", "signed_at");
CREATE INDEX "deal_signatures_user_signed_idx"
  ON "deal_signatures"("user_id", "signed_at");
CREATE INDEX "deal_signatures_document_hash_idx"
  ON "deal_signatures"("document_hash");

ALTER TABLE "deal_signatures"
  ADD CONSTRAINT "deal_signatures_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_signatures"
  ADD CONSTRAINT "deal_signatures_deal_version_id_deal_id_fkey"
  FOREIGN KEY ("deal_version_id", "deal_id") REFERENCES "deal_versions"("id", "deal_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_signatures"
  ADD CONSTRAINT "deal_signatures_party_id_deal_id_fkey"
  FOREIGN KEY ("party_id", "deal_id") REFERENCES "deal_parties"("id", "deal_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_signatures"
  ADD CONSTRAINT "deal_signatures_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_signatures"
  ADD CONSTRAINT "deal_signatures_verified_phone_id_fkey"
  FOREIGN KEY ("verified_phone_id") REFERENCES "user_phones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
