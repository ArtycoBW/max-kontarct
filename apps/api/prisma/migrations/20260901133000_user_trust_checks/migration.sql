CREATE TYPE "trust_check_type" AS ENUM (
  'MAX_ACCOUNT',
  'PHONE',
  'REQUISITES_FORMAT',
  'REQUIRED_FILES',
  'INTERNAL_REVIEW'
);

CREATE TYPE "trust_check_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "trust_check_source" AS ENUM (
  'MAX',
  'DEV',
  'PROFILE',
  'DADATA',
  'FILES',
  'ADMIN',
  'SYSTEM'
);

CREATE TABLE "user_trust_checks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "trust_check_type" NOT NULL,
  "status" "trust_check_status" NOT NULL DEFAULT 'PENDING',
  "source" "trust_check_source" NOT NULL,
  "checked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "user_trust_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_trust_checks_user_type_key"
  ON "user_trust_checks"("user_id", "type");
CREATE INDEX "user_trust_checks_type_status_updated_idx"
  ON "user_trust_checks"("type", "status", "updated_at");

ALTER TABLE "user_trust_checks"
  ADD CONSTRAINT "user_trust_checks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_trust_checks"
  ADD CONSTRAINT "user_trust_checks_checked_at_consistent"
  CHECK (
    ("status" = 'PENDING' AND "checked_at" IS NULL)
    OR ("status" IN ('CONFIRMED', 'REJECTED') AND "checked_at" IS NOT NULL)
  );
