CREATE TYPE "deal_artifact_type" AS ENUM ('FINAL_PDF', 'EVIDENCE_ZIP');

CREATE TABLE "deal_artifacts" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "deal_version_id" UUID NOT NULL,
  "type" "deal_artifact_type" NOT NULL,
  "bucket" VARCHAR(128) NOT NULL,
  "object_key" VARCHAR(512) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "public_code" VARCHAR(32),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_artifacts_size_bytes_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "deal_artifacts_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "deal_artifacts_public_code_key" ON "deal_artifacts"("public_code");
CREATE UNIQUE INDEX "deal_artifacts_version_type_key" ON "deal_artifacts"("deal_version_id", "type");
CREATE INDEX "deal_artifacts_deal_created_idx" ON "deal_artifacts"("deal_id", "created_at");
CREATE INDEX "deal_artifacts_sha256_idx" ON "deal_artifacts"("sha256");

ALTER TABLE "deal_artifacts" ADD CONSTRAINT "deal_artifacts_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_artifacts" ADD CONSTRAINT "deal_artifacts_deal_version_id_deal_id_fkey"
  FOREIGN KEY ("deal_version_id", "deal_id") REFERENCES "deal_versions"("id", "deal_id") ON DELETE CASCADE ON UPDATE CASCADE;
