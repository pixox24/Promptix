export type PartitionableGovernanceProposal = { requiresApproval: boolean };

export function partitionGovernanceProposals<T extends PartitionableGovernanceProposal>(proposals: T[]) {
  return {
    automatic: proposals.filter((proposal) => !proposal.requiresApproval),
    approval: proposals.filter((proposal) => proposal.requiresApproval),
  };
}
