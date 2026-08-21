INSERT INTO "permissions" ("id", "module", "action", "nameAr", "nameHe", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'settings', 'UPDATE', 'تعديل إعدادات المؤسسة', NULL, true, now(), now())
ON CONFLICT ("module", "action") DO NOTHING;

INSERT INTO "role_permissions" ("id", "institutionId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."institutionId", r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON p."module" = 'settings' AND p."action" = 'UPDATE'
WHERE r."isSystem" = true
ON CONFLICT ("institutionId", "roleId", "permissionId") DO NOTHING;
