-- Preserve existing addresses; allow explicitly unverified user-entered values.
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_address_complete";
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_address_complete"
  CHECK (
    ("address_value" IS NULL AND "address_source" IS NULL AND "address_normalized_at" IS NULL)
    OR
    ("address_value" IS NOT NULL AND "address_source" IN ('DADATA', 'MOCK', 'MANUAL') AND "address_normalized_at" IS NOT NULL)
  );
