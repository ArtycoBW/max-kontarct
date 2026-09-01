CREATE TYPE "deal_file_category" AS ENUM ('REQUIREMENT', 'EVIDENCE');
CREATE TYPE "deal_file_visibility" AS ENUM ('OWNER_ONLY', 'DEAL_PARTICIPANTS');

CREATE TABLE "deal_files" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "requirement_id" UUID,
  "category" "deal_file_category" NOT NULL,
  "visibility" "deal_file_visibility" NOT NULL,
  "bucket" VARCHAR(128) NOT NULL,
  "object_key" VARCHAR(255) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "deal_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deal_files_object_key_key" ON "deal_files"("object_key");
CREATE INDEX "deal_files_deal_category_uploaded_idx" ON "deal_files"("deal_id", "category", "uploaded_at");
CREATE INDEX "deal_files_owner_uploaded_idx" ON "deal_files"("owner_user_id", "uploaded_at");
CREATE INDEX "deal_files_requirement_id_idx" ON "deal_files"("requirement_id");

ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_deal_id_fkey" FOREIGN KEY ("deal_id")
  REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_owner_user_id_fkey" FOREIGN KEY ("owner_user_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_requirement_id_fkey" FOREIGN KEY ("requirement_id")
  REFERENCES "template_document_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_size_positive" CHECK ("size_bytes" > 0),
  ADD CONSTRAINT "deal_files_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "deal_files_requirement_consistent" CHECK (
    ("category" = 'REQUIREMENT' AND "requirement_id" IS NOT NULL)
    OR ("category" = 'EVIDENCE' AND "requirement_id" IS NULL)
  );
