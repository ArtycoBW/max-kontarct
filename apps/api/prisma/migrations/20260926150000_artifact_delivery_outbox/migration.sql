CREATE TABLE "artifact_deliveries" (
  "id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "upload_token" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artifact_deliveries_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "deal_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "artifact_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "artifact_deliveries_recipient_key" ON "artifact_deliveries"("artifact_id", "user_id");
CREATE INDEX "artifact_deliveries_pending_idx" ON "artifact_deliveries"("status", "next_attempt_at");
