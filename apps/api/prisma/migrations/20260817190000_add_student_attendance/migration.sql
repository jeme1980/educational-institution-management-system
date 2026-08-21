-- Create the real student attendance ledger without changing existing data.
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE UNIQUE INDEX "student_enrollments_institutionId_id_key"
  ON "student_enrollments" ("institutionId", "id");

CREATE TABLE "student_attendance" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "studentEnrollmentId" UUID NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" UUID,
  "updatedBy" UUID,

  CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_attendance_enrollment_date_key"
  ON "student_attendance" ("institutionId", "studentEnrollmentId", "attendanceDate");

CREATE INDEX "student_attendance_date_idx"
  ON "student_attendance" ("institutionId", "attendanceDate");

CREATE INDEX "student_attendance_enrollment_date_idx"
  ON "student_attendance" ("institutionId", "studentEnrollmentId", "attendanceDate");

ALTER TABLE "student_attendance"
  ADD CONSTRAINT "student_attendance_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "institutions" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance"
  ADD CONSTRAINT "student_attendance_institutionId_studentEnrollmentId_fkey"
  FOREIGN KEY ("institutionId", "studentEnrollmentId")
  REFERENCES "student_enrollments" ("institutionId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance" FORCE ROW LEVEL SECURITY;

CREATE POLICY "student_attendance_rls_policy" ON "student_attendance"
  FOR ALL
  USING ("institutionId" = current_setting('app.current_institution_id', true)::uuid)
  WITH CHECK ("institutionId" = current_setting('app.current_institution_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_attendance" TO school_app;
