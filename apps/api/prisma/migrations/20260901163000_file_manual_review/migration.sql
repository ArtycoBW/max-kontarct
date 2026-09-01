CREATE TYPE "deal_file_review_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "deal_files"
  ADD COLUMN "review_status" "deal_file_review_status" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "review_comment" VARCHAR(1000),
  ADD COLUMN "reviewed_by_user_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(3);

CREATE INDEX "deal_files_review_status_uploaded_idx"
  ON "deal_files"("review_status", "uploaded_at");

ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal_files"
  ADD CONSTRAINT "deal_files_review_consistent" CHECK (
    ("review_status" = 'PENDING' AND "reviewed_at" IS NULL AND "reviewed_by_user_id" IS NULL)
    OR
    ("review_status" IN ('ACCEPTED', 'REJECTED') AND "reviewed_at" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "deal_files_rejection_comment_required" CHECK (
    "review_status" <> 'REJECTED' OR length(trim("review_comment")) >= 3
  );
