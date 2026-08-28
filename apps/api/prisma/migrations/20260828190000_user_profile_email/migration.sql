-- AlterTable
ALTER TABLE "user_profiles"
ADD COLUMN "email" VARCHAR(254);

-- Contact data is normalized by the application before it reaches storage.
ALTER TABLE "user_profiles"
ADD CONSTRAINT "user_profiles_email_not_blank"
CHECK ("email" IS NULL OR length(btrim("email")) > 3),
ADD CONSTRAINT "user_profiles_email_normalized"
CHECK ("email" IS NULL OR "email" = lower(btrim("email")));
