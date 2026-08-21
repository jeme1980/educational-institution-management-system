-- Phase 7B-3: enforce institution and academic-context ownership for study groups and exams.
-- Preflight confirmed zero mismatches before applying this migration.

CREATE UNIQUE INDEX "academic_periods_institutionId_academicYearId_id_key"
ON "academic_periods"("institutionId", "academicYearId", "id");

CREATE UNIQUE INDEX "subjects_institutionId_academicYearId_id_key"
ON "subjects"("institutionId", "academicYearId", "id");

CREATE UNIQUE INDEX "staff_assignments_institutionId_academicYearId_id_key"
ON "staff_assignments"("institutionId", "academicYearId", "id");

CREATE UNIQUE INDEX "exam_types_institutionId_id_key"
ON "exam_types"("institutionId", "id");

CREATE UNIQUE INDEX "study_groups_institutionId_id_key"
ON "study_groups"("institutionId", "id");

CREATE UNIQUE INDEX "exams_institutionId_id_key"
ON "exams"("institutionId", "id");

ALTER TABLE "study_groups"
DROP CONSTRAINT "study_groups_academicYearId_fkey",
DROP CONSTRAINT "study_groups_classId_fkey",
DROP CONSTRAINT "study_groups_subjectId_fkey",
DROP CONSTRAINT "study_groups_staffAssignmentId_fkey";

ALTER TABLE "study_groups"
ADD CONSTRAINT "study_groups_institutionId_academicYearId_fkey"
FOREIGN KEY ("institutionId", "academicYearId")
REFERENCES "academic_years"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "study_groups_institutionId_academicYearId_classId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "classId")
REFERENCES "classes"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "study_groups_institutionId_academicYearId_subjectId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "subjectId")
REFERENCES "subjects"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "study_groups_institutionId_academicYearId_staffAssignmentId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "staffAssignmentId")
REFERENCES "staff_assignments"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exams"
DROP CONSTRAINT "exams_academicYearId_fkey",
DROP CONSTRAINT "exams_academicPeriodId_fkey",
DROP CONSTRAINT "exams_subjectId_fkey",
DROP CONSTRAINT "exams_examTypeId_fkey";

ALTER TABLE "exams"
ADD CONSTRAINT "exams_institutionId_academicYearId_fkey"
FOREIGN KEY ("institutionId", "academicYearId")
REFERENCES "academic_years"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "exams_institutionId_academicYearId_academicPeriodId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "academicPeriodId")
REFERENCES "academic_periods"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "exams_institutionId_academicYearId_subjectId_fkey"
FOREIGN KEY ("institutionId", "academicYearId", "subjectId")
REFERENCES "subjects"("institutionId", "academicYearId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "exams_institutionId_examTypeId_fkey"
FOREIGN KEY ("institutionId", "examTypeId")
REFERENCES "exam_types"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_study_groups"
DROP CONSTRAINT "exam_study_groups_examId_fkey",
DROP CONSTRAINT "exam_study_groups_studyGroupId_fkey";

ALTER TABLE "exam_study_groups"
ADD CONSTRAINT "exam_study_groups_institutionId_examId_fkey"
FOREIGN KEY ("institutionId", "examId")
REFERENCES "exams"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "exam_study_groups_institutionId_studyGroupId_fkey"
FOREIGN KEY ("institutionId", "studyGroupId")
REFERENCES "study_groups"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_questions"
DROP CONSTRAINT "exam_questions_examId_fkey";

ALTER TABLE "exam_questions"
ADD CONSTRAINT "exam_questions_institutionId_examId_fkey"
FOREIGN KEY ("institutionId", "examId")
REFERENCES "exams"("institutionId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
