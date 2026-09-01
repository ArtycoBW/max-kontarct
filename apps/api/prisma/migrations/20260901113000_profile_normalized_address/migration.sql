ALTER TABLE "user_profiles"
  ADD COLUMN "address_value" VARCHAR(500),
  ADD COLUMN "address_source" VARCHAR(16),
  ADD COLUMN "address_fias_id" VARCHAR(64),
  ADD COLUMN "address_kladr_id" VARCHAR(64),
  ADD COLUMN "address_postal_code" VARCHAR(16),
  ADD COLUMN "address_region" VARCHAR(160),
  ADD COLUMN "address_city" VARCHAR(160),
  ADD COLUMN "address_street" VARCHAR(160),
  ADD COLUMN "address_house" VARCHAR(64),
  ADD COLUMN "address_quality_code" VARCHAR(16),
  ADD COLUMN "address_normalized_at" TIMESTAMPTZ(3);

ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_address_complete"
  CHECK (
    ("address_value" IS NULL AND "address_source" IS NULL AND "address_normalized_at" IS NULL)
    OR
    ("address_value" IS NOT NULL AND "address_source" IN ('DADATA', 'MOCK') AND "address_normalized_at" IS NOT NULL)
  );
