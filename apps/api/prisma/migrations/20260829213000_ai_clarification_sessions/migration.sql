CREATE TYPE "ai_generation_status" AS ENUM ('NEED_MORE_INFO', 'READY_TO_GENERATE');

CREATE TABLE "ai_generations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "status" "ai_generation_status" NOT NULL,
  "input_answers" JSONB NOT NULL,
  "questions" JSONB NOT NULL,
  "clarification_answers" JSONB,
  "provider_metadata" JSONB NOT NULL,
  "prompt_id" VARCHAR(64) NOT NULL,
  "prompt_version" VARCHAR(32) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_generations_user_created_at_idx"
  ON "ai_generations"("user_id", "created_at");

CREATE INDEX "ai_generations_template_status_idx"
  ON "ai_generations"("template_version_id", "status");

ALTER TABLE "ai_generations"
  ADD CONSTRAINT "ai_generations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_generations"
  ADD CONSTRAINT "ai_generations_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
