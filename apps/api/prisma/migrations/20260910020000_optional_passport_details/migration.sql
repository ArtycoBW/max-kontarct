-- Explicitly reviewed profile fields only; OCR images/raw text are never stored.
ALTER TABLE "user_profiles" ADD COLUMN "passport_details" JSONB;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_passport_object"
  CHECK ("passport_details" IS NULL OR jsonb_typeof("passport_details") = 'object');
