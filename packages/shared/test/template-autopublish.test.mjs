import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autopublishRulesSchema,
  autopublishRunStatusSchema,
  decideAutopublishPolicy,
  governanceExecutionModeSchema,
} from '../dist/index.js';

const passingAssessment = {
  overallScore: 94,
  criticalDimensions: {
    semanticFidelity: 93,
    promptCoherence: 92,
    variableReuse: 90,
    taxonomyAccuracy: 95,
    coverAlignment: 91,
  },
  hardGateFailures: [],
  requiresCounterReview: false,
};
const passingRules = autopublishRulesSchema.parse({});

test('contracts expose terminal and resumable autopublish states', () => {
  assert.equal(autopublishRunStatusSchema.parse('needs_attention'), 'needs_attention');
  assert.equal(autopublishRunStatusSchema.parse('duplicate_found'), 'duplicate_found');
  assert.equal(autopublishRunStatusSchema.parse('conflict_waiting'), 'conflict_waiting');
  assert.equal(governanceExecutionModeSchema.parse('autopilot'), 'autopilot');
});

test('policy requires 92 overall, 85 per dimension and no hard-gate failures', () => {
  assert.deepEqual(
    decideAutopublishPolicy({ assessment: passingAssessment, budgetExceeded: false, rules: passingRules }),
    { kind: 'issue_permit' },
  );
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, overallScore: 91 },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'needs_attention');
  assert.equal(decideAutopublishPolicy({
    assessment: {
      ...passingAssessment,
      criticalDimensions: { ...passingAssessment.criticalDimensions, coverAlignment: 84 },
    },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'needs_attention');
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, hardGateFailures: ['SAFETY_REJECTED'] },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'rejected');
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, hardGateFailures: ['EXACT_DUPLICATE'] },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'duplicate_found');
});

test('default rules freeze the approved safety and budget values', () => {
  const rules = autopublishRulesSchema.parse({});
  assert.equal(rules.maximumRepairAttempts, 2);
  assert.equal(rules.observationHours, 72);
  assert.equal(rules.frozen, false);
  assert.equal(rules.budgets.maximumModelCalls, 6);
  assert.equal(rules.budgets.maximumCoverAttempts, 2);
  assert.equal(rules.budgets.maximumDurationMinutes, 10);
});
