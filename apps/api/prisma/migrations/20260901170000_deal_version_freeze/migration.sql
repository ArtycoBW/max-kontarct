ALTER TABLE "deal_versions"
  ADD COLUMN "frozen_snapshot" JSONB,
  ADD COLUMN "snapshot_hash" CHAR(64),
  ADD COLUMN "frozen_at" TIMESTAMPTZ(3),
  ADD COLUMN "contract_number" VARCHAR(64);

CREATE UNIQUE INDEX "deal_versions_contract_number_key"
  ON "deal_versions"("contract_number");

ALTER TABLE "deal_versions"
  ADD CONSTRAINT "deal_versions_freeze_fields_check" CHECK (
    ("frozen_snapshot" IS NULL AND "snapshot_hash" IS NULL AND "frozen_at" IS NULL AND "contract_number" IS NULL)
    OR
    ("frozen_snapshot" IS NOT NULL AND "snapshot_hash" IS NOT NULL AND "frozen_at" IS NOT NULL AND "contract_number" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION prevent_frozen_deal_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."frozen_at" IS NOT NULL AND (
    NEW."terms" IS DISTINCT FROM OLD."terms"
    OR NEW."contract_draft" IS DISTINCT FROM OLD."contract_draft"
    OR NEW."source_generation_id" IS DISTINCT FROM OLD."source_generation_id"
    OR NEW."frozen_snapshot" IS DISTINCT FROM OLD."frozen_snapshot"
    OR NEW."snapshot_hash" IS DISTINCT FROM OLD."snapshot_hash"
    OR NEW."frozen_at" IS DISTINCT FROM OLD."frozen_at"
    OR NEW."contract_number" IS DISTINCT FROM OLD."contract_number"
  ) THEN
    RAISE EXCEPTION 'Frozen deal version content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "deal_versions_prevent_frozen_mutation"
BEFORE UPDATE ON "deal_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_frozen_deal_version_mutation();
