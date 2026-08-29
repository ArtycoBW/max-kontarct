ALTER TYPE "ai_generation_status" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ai_generation_status" ADD VALUE IF NOT EXISTS 'GENERATING';
ALTER TYPE "ai_generation_status" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "ai_generation_status" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "ai_generations"
  ADD COLUMN "structured_draft" JSONB,
  ADD COLUMN "failure_code" VARCHAR(64),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queued_at" TIMESTAMPTZ(3),
  ADD COLUMN "started_at" TIMESTAMPTZ(3),
  ADD COLUMN "failed_at" TIMESTAMPTZ(3);

CREATE INDEX "ai_generations_user_status_updated_idx"
  ON "ai_generations"("user_id", "status", "updated_at");
