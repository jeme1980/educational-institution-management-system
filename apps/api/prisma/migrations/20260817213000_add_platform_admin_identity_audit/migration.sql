ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "platform_audit_logs" (
  "id" UUID NOT NULL,
  "actorUserId" UUID,
  "action" VARCHAR(60) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" UUID,
  "targetInstitutionId" UUID,
  "targetPlanId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");
CREATE INDEX "platform_audit_logs_targetInstitutionId_createdAt_idx" ON "platform_audit_logs"("targetInstitutionId", "createdAt");
CREATE INDEX "platform_audit_logs_entityType_entityId_idx" ON "platform_audit_logs"("entityType", "entityId");
