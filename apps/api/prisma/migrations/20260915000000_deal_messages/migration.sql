CREATE TABLE "deal_messages" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "kind" VARCHAR(20) NOT NULL DEFAULT 'MESSAGE',
  "version_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_messages_kind_check" CHECK ("kind" IN ('MESSAGE', 'CHANGE_REQUEST')),
  CONSTRAINT "deal_messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE,
  CONSTRAINT "deal_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "deal_messages_idempotency_key" ON "deal_messages"("deal_id", "author_id", "client_id");
CREATE INDEX "deal_messages_timeline_idx" ON "deal_messages"("deal_id", "created_at", "id");
