-- Phase 7B-1: enforce student existence and institution ownership for exam results.
-- Preflight confirmed there are no orphan or cross-institution rows before applying this migration.

CREATE UNIQUE INDEX "students_institutionId_id_key"
ON "students"("institutionId", "id");

ALTER TABLE "student_exam_results"
ADD CONSTRAINT "student_exam_results_institutionId_studentId_fkey"
FOREIGN KEY ("institutionId", "studentId")
REFERENCES "students"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_question_scores"
ADD CONSTRAINT "student_question_scores_institutionId_studentId_fkey"
FOREIGN KEY ("institutionId", "studentId")
REFERENCES "students"("institutionId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
