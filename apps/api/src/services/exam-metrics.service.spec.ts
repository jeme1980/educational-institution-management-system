import { strict as assert } from 'node:assert';
import { isPassingPercentage, normalizeExamAnalysisScore } from './exam-metrics.service';

assert.equal(normalizeExamAnalysisScore(89, 89), 100);
assert.equal(normalizeExamAnalysisScore(44.5, 89), 50);
assert.ok(Math.abs((normalizeExamAnalysisScore(58, 89) ?? 0) - 65.1685393258) < 1e-9);
assert.equal(normalizeExamAnalysisScore(0, 89), 0);
assert.equal(normalizeExamAnalysisScore(37.5, 75), 50);
assert.equal(normalizeExamAnalysisScore(60, 120), 50);
assert.equal(normalizeExamAnalysisScore(10, 0), null);
assert.ok((normalizeExamAnalysisScore(110, 89) ?? 0) > 100, 'Over-maximum data must remain visible to quality checks');
assert.equal(isPassingPercentage(normalizeExamAnalysisScore(44.49, 89) ?? 0), false);
assert.equal(isPassingPercentage(normalizeExamAnalysisScore(44.5, 89) ?? 0), true);

console.log('Exam analysis score normalization tests passed.');
