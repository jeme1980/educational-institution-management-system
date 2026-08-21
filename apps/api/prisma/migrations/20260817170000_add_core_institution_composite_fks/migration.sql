-- Phase 7B-2: enforce institution ownership across core enrollment, staffing, and role relations.
-- Preflight confirmed zero mismatches before applying this migration.

CREATE UNIQUE INDEX "academic_years_institutionId_id_key"
ON "academic_years"("institutionId", "id");

CREATE UNIQUE INDEX "classes_institutionId_academicYearId_id_key"
ON "classes"("institutionId", "academicYearId", "id");

CREATE UNIQUE INDEX "staff_members_institutionId_id_key"
ON "staff_members"("institutionId", "id");

CREATE UNIQUE INDEX "job_roles_institutionId_id_key"
ON "job_roles"("institutionId", "id");

CREATE UNIQUE INDEX "institution_users_institutionId_id_key"
ON "institution_users"("institutionId", "id");

CREATE UNIQUE INDEX "roles_institutionId_id_key"
ON "roles"("institutionId", "id");

ALTER TABLE "student_enrollments"
DROP CONSTRAINT "student_enrollments_academicYearId_fkey",
DROP CONSTRAINT "student_enrollments_studentId_fkey",
DROP CONSTRAINT "student_enrollments_classId_fkey";

ALTER TABLE "student_enrollments"
ADD CONSTRAINT "student_enrollments_institutionId_academicYearId_fkey"
FOREIGN KEY ("institutionId", "academicYearId")
REFERENCES "academic_years"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "student_enrollments_institutionId_studentId_fkey"
FOREIGN KEY ("institutionId", "studentId")
REFERENCES "students"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "student_enrollments_institutionId_academicYearId_classId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "classId")
REFERENCES "classes"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_assignments"
DROP CONSTRAINT "staff_assignments_academicYearId_fkey",
DROP CONSTRAINT "staff_assignments_staffMemberId_fkey",
DROP CONSTRAINT "staff_assignments_jobRoleId_fkey";

ALTER TABLE "staff_assignments"
ADD CONSTRAINT "staff_assignments_institutionId_academicYearId_fkey"
FOREIGN KEY ("institutionId", "academicYearId")
REFERENCES "academic_years"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "staff_assignments_institutionId_staffMemberId_fkey"
FOREIGN KEY ("institutionId", "staffMemberId")
REFERENCES "staff_members"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "staff_assignments_institutionId_jobRoleId_fkey"
FOREIGN KEY ("institutionId", "jobRoleId")
REFERENCES "job_roles"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "institution_user_roles"
DROP CONSTRAINT "institution_user_roles_institutionUserId_fkey",
DROP CONSTRAINT "institution_user_roles_roleId_fkey";

ALTER TABLE "institution_user_roles"
ADD CONSTRAINT "institution_user_roles_institutionId_institutionUserId_fkey"
FOREIGN KEY ("institutionId", "institutionUserId")
REFERENCES "institution_users"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "institution_user_roles_institutionId_roleId_fkey"
FOREIGN KEY ("institutionId", "roleId")
REFERENCES "roles"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
DROP CONSTRAINT "role_permissions_roleId_fkey";

ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_institutionId_roleId_fkey"
FOREIGN KEY ("institutionId", "roleId")
REFERENCES "roles"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
