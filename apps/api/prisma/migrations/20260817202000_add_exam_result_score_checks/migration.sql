-- Preflight confirmed no existing rows violate these invariants.
ALTER TABLE "student_question_scores"
  ADD CONSTRAINT "student_question_scores_score_nonnegative" CHECK ("score" >= 0);

ALTER TABLE "student_exam_results"
  ADD CONSTRAINT "student_exam_results_total_score_nonnegative" CHECK ("totalScore" >= 0);
