-- CreateEnum
CREATE TYPE "template_version_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "template_version_status" NOT NULL DEFAULT 'DRAFT',
    "questionnaire_schema" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contract_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_document_requirements" (
    "id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "template_document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_templates_slug_key" ON "contract_templates"("slug");

-- CreateIndex
CREATE INDEX "contract_templates_demo_title_idx" ON "contract_templates"("is_demo", "title");

-- CreateIndex
CREATE UNIQUE INDEX "contract_template_versions_template_version_key" ON "contract_template_versions"("template_id", "version_number");

-- CreateIndex
CREATE INDEX "contract_template_versions_status_published_idx" ON "contract_template_versions"("status", "published_at");

-- CreateIndex
CREATE INDEX "contract_template_versions_template_status_version_idx" ON "contract_template_versions"("template_id", "status", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "template_document_requirements_version_key_key" ON "template_document_requirements"("template_version_id", "key");

-- CreateIndex
CREATE INDEX "template_document_requirements_version_sort_idx" ON "template_document_requirements"("template_version_id", "sort_order");

-- AddForeignKey
ALTER TABLE "contract_template_versions"
ADD CONSTRAINT "contract_template_versions_template_id_fkey"
FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_document_requirements"
ADD CONSTRAINT "template_document_requirements_template_version_id_fkey"
FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma's schema language.
ALTER TABLE "contract_templates"
ADD CONSTRAINT "contract_templates_slug_format"
CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
ADD CONSTRAINT "contract_templates_title_not_blank"
CHECK (length(btrim("title")) > 0),
ADD CONSTRAINT "contract_templates_summary_not_blank"
CHECK (length(btrim("summary")) > 0);

ALTER TABLE "contract_template_versions"
ADD CONSTRAINT "contract_template_versions_positive_version"
CHECK ("version_number" > 0),
ADD CONSTRAINT "contract_template_versions_schema_object"
CHECK (jsonb_typeof("questionnaire_schema") = 'object'),
ADD CONSTRAINT "contract_template_versions_status_timestamps"
CHECK (
  ("status" = 'DRAFT' AND "published_at" IS NULL AND "archived_at" IS NULL)
  OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "archived_at" IS NULL)
  OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
);

ALTER TABLE "template_document_requirements"
ADD CONSTRAINT "template_document_requirements_key_format"
CHECK ("key" ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
ADD CONSTRAINT "template_document_requirements_title_not_blank"
CHECK (length(btrim("title")) > 0),
ADD CONSTRAINT "template_document_requirements_non_negative_sort_order"
CHECK ("sort_order" >= 0);
