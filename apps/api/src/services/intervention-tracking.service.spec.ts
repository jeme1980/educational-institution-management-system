import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateInterventionOutcome } from './intervention-tracking.service';

test('intervention outcomes distinguish improvement, decline and no comparison', () => {
  const improved = evaluateInterventionOutcome(40, 65, 60, 4, 3);
  assert.equal(improved.outcome, 'improved');
  assert.equal(improved.criterionMet, true);
  assert.equal(improved.coverage, 75);

  const declined = evaluateInterventionOutcome(70, 55, 80, 2, 2);
  assert.equal(declined.outcome, 'declined');
  assert.equal(declined.criterionMet, false);

  const noComparison = evaluateInterventionOutcome(50, null, 60, 3, 0);
  assert.equal(noComparison.outcome, 'noComparison');
  assert.equal(noComparison.criterionMet, null);
  assert.equal(noComparison.coverage, 0);
});
