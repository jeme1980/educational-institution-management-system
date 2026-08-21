-- Enforce the invariant used by the institution settings current-year switch.
CREATE UNIQUE INDEX "academic_years_one_current_per_institution"
ON "academic_years" ("institutionId")
WHERE "isCurrent" = true;
