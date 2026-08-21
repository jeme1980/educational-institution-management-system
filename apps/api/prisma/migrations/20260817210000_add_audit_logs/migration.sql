CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "actorUserId" UUID,
  "action" VARCHAR(40) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_institutionId_createdAt_idx" ON "audit_logs"("institutionId", "createdAt");
CREATE INDEX "audit_logs_institutionId_entityType_entityId_idx" ON "audit_logs"("institutionId", "entityType", "entityId");
CREATE INDEX "audit_logs_institutionId_action_createdAt_idx" ON "audit_logs"("institutionId", "action", "createdAt");

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_rls_policy" ON "audit_logs" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);

INSERT INTO "permissions" ("id", "module", "action", "nameAr", "nameHe", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'audit', 'READ', 'قراءة سجل التدقيق', NULL, true, now(), now())
ON CONFLICT ("module", "action") DO NOTHING;
INSERT INTO "role_permissions" ("id", "institutionId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."institutionId", r."id", p."id", now()
FROM "roles" r JOIN "permissions" p ON p."module" = 'audit' AND p."action" = 'READ'
WHERE r."isSystem" = true
ON CONFLICT ("institutionId", "roleId", "permissionId") DO NOTHING;
