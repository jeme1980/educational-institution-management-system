-- Permission catalog data only; survey tables and RLS were added in Phase 1.
INSERT INTO "permissions" ("id", "module", "action", "nameAr", "nameHe", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'surveys', 'READ', 'عرض الاستبيانات', 'צפייה בסקרים', true, now(), now()),
  (gen_random_uuid(), 'surveys', 'UPDATE', 'إدارة الاستبيانات', 'ניהול סקרים', true, now(), now())
ON CONFLICT ("module", "action") DO UPDATE SET "isActive" = true, "updatedAt" = now();

INSERT INTO "role_permissions" ("id", "institutionId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), roles."institutionId", roles."id", permissions."id", now()
FROM "roles" AS roles
CROSS JOIN "permissions" AS permissions
WHERE roles."isSystem" = true
  AND roles."isActive" = true
  AND roles."archivedAt" IS NULL
  AND permissions."module" = 'surveys'
  AND permissions."action" IN ('READ', 'UPDATE')
ON CONFLICT ("institutionId", "roleId", "permissionId") DO NOTHING;
