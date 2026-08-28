-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "phone_verification_source" AS ENUM ('MAX', 'DEV');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('PERSONAL_DATA', 'TERMS_OF_USE', 'STATUS_NOTIFICATIONS', 'ELECTRONIC_SIGNATURE');

-- CreateEnum
CREATE TYPE "consent_source" AS ENUM ('MINI_APP', 'DEV_SEED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "max_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "max_user_id" VARCHAR(128) NOT NULL,
    "username" VARCHAR(128),
    "first_name" VARCHAR(128),
    "last_name" VARCHAR(128),
    "language_code" VARCHAR(16),
    "last_authenticated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "max_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_phones" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "e164" VARCHAR(16) NOT NULL,
    "source" "phone_verification_source" NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "birth_date" DATE,
    "locale" VARCHAR(16),
    "timezone" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "document_version" VARCHAR(64) NOT NULL,
    "document_hash" CHAR(64),
    "granted" BOOLEAN NOT NULL,
    "source" "consent_source" NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "event_type" VARCHAR(128) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" VARCHAR(128),
    "request_id" VARCHAR(128),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "max_accounts_user_id_key" ON "max_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "max_accounts_max_user_id_key" ON "max_accounts"("max_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_hash_key" ON "user_sessions"("session_hash");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_phones_e164_key" ON "user_phones"("e164");

-- CreateIndex
CREATE INDEX "user_phones_user_id_idx" ON "user_phones"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "user_consents_user_type_created_at_idx" ON "user_consents"("user_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_user_type_version_key" ON "user_consents"("user_id", "type", "document_version");

-- CreateIndex
CREATE INDEX "audit_events_actor_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_type_created_at_idx" ON "audit_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_request_id_idx" ON "audit_events"("request_id");

-- AddForeignKey
ALTER TABLE "max_accounts" ADD CONSTRAINT "max_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_phones" ADD CONSTRAINT "user_phones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma's schema language.
ALTER TABLE "max_accounts"
ADD CONSTRAINT "max_accounts_max_user_id_not_blank"
CHECK (length(btrim("max_user_id")) > 0);

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_session_hash_format"
CHECK ("session_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "user_sessions_expiry_after_creation"
CHECK ("expires_at" > "created_at");

ALTER TABLE "user_phones"
ADD CONSTRAINT "user_phones_e164_format"
CHECK ("e164" ~ '^\+[1-9][0-9]{7,14}$');

CREATE UNIQUE INDEX "user_phones_one_primary_per_user_key"
ON "user_phones" ("user_id")
WHERE "is_primary" = true;

ALTER TABLE "user_profiles"
ADD CONSTRAINT "user_profiles_first_name_not_blank"
CHECK (length(btrim("first_name")) > 0),
ADD CONSTRAINT "user_profiles_last_name_not_blank"
CHECK (length(btrim("last_name")) > 0);

ALTER TABLE "user_consents"
ADD CONSTRAINT "user_consents_document_version_not_blank"
CHECK (length(btrim("document_version")) > 0),
ADD CONSTRAINT "user_consents_document_hash_format"
CHECK ("document_hash" IS NULL OR "document_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_event_type_not_blank"
CHECK (length(btrim("event_type")) > 0),
ADD CONSTRAINT "audit_events_entity_reference_complete"
CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL));
