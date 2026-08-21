-- Phase 9A: SaaS core domain. Billing, checkout and platform administration are
-- intentionally outside this migration.
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "plans" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "nameHe" VARCHAR(100),
  "descriptionAr" VARCHAR(500),
  "descriptionHe" VARCHAR(500),
  "maxStudents" INTEGER,
  "maxStaff" INTEGER,
  "maxUsers" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_isActive_code_idx" ON "plans"("isActive", "code");

CREATE TABLE "institution_subscriptions" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "institution_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "institution_subscriptions_institutionId_status_startsAt_idx"
  ON "institution_subscriptions"("institutionId", "status", "startsAt");
CREATE INDEX "institution_subscriptions_planId_status_idx"
  ON "institution_subscriptions"("planId", "status");

ALTER TABLE "institution_subscriptions"
  ADD CONSTRAINT "institution_subscriptions_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "institution_subscriptions"
  ADD CONSTRAINT "institution_subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A school may have historical cancelled/expired rows, but only one current
-- lifecycle row at a time.
CREATE UNIQUE INDEX "institution_subscriptions_one_current_idx"
  ON "institution_subscriptions"("institutionId")
  WHERE "status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');

-- Existing institutions remain usable immediately after deployment.
INSERT INTO "plans" ("id", "code", "nameAr", "descriptionAr", "isActive", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000901', 'LEGACY', 'الخطة legacy', 'خطة توافقية غير محدودة للبيانات الحالية', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "institution_subscriptions" ("id", "institutionId", "planId", "status", "startsAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), i."id", p."id", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "institutions" i
CROSS JOIN "plans" p
WHERE p."code" = 'LEGACY'
  AND NOT EXISTS (
    SELECT 1 FROM "institution_subscriptions" s WHERE s."institutionId" = i."id"
  );

ALTER TABLE "institution_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "institution_subscriptions_rls_policy" ON "institution_subscriptions"
  FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);

GRANT SELECT ON TABLE "plans" TO school_app;
GRANT SELECT ON TABLE "institution_subscriptions" TO school_app;
