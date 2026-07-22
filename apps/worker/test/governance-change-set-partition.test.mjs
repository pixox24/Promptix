import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../dist/governance-change-set-partition.js', import.meta.url);

test('partitions automatic and approval proposals into homogeneous sets', async () => {
  const { partitionGovernanceProposals } = await import(moduleUrl);
  const proposals = [
    { id: 'auto', requiresApproval: false },
    { id: 'approval', requiresApproval: true },
  ];
  const result = partitionGovernanceProposals(proposals);
  assert.deepEqual(result.automatic.map((proposal) => proposal.id), ['auto']);
  assert.deepEqual(result.approval.map((proposal) => proposal.id), ['approval']);
});
