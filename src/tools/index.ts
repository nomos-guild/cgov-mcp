import type { ToolHandler } from "../types/index.js";

// Schema tools
import { listTables, describeTable } from "./schema.js";

// Query tools
import { queryDatabase } from "./query.js";

// Constitution tools
import { searchConstitutionTool, getConstitutionSection } from "./constitution.js";

// Vision 2030 tools
import { searchVisionTool, getVisionSection, getVisionKPIs } from "./vision.js";

// Voting Principles tools
import {
  searchVotingPrinciplesTool,
  getVotingPrinciplesSection,
  getVotingKPIBudgets,
  getFundingPartitions,
  getVotingCriteria,
} from "./voting-principles.js";

// Voting Rationale tools
import {
  searchVotingRationale,
  getVoteRationale,
  getDrepVotingHistory,
  getProposalRationales,
  getRationaleStats,
} from "./rationale.js";

// DRep tools
import { searchDreps, getDrepProfile, getTopDreps } from "./drep.js";

// Proposal tools
import { searchProposals, getProposalDetails, getProposalStats } from "./proposal.js";

// SPO tools
import { searchSPOs, getTopSPOs, getSPOVotingHistory } from "./spo.js";

// CC tools
import { searchCCMembers, getCCVotingHistory, getCommitteeState } from "./cc.js";

// Analytics tools
import { getEpochTotals, getNCL, getDelegationStats, getDevActivity } from "./analytics.js";

// Participation analytics tools
import { getVotingTurnout, getDelegationDistribution, getDelegationTrends } from "./participation.js";

// Concentration analytics tools
import { getDrepConcentration, getSpoEntityConcentration, getVoteDivergence } from "./concentration.js";

// Efficiency analytics tools
import { getTimeToEnactment, getContentionRate, getGovernanceVolume } from "./efficiency.js";

// CC analytics tools
import { getCCDecisionMetrics, getComplianceStatus } from "./cc-analytics.js";

// DRep analytics tools
import { getDrepActivityRate, getDrepRationaleRate, getDrepLifecycleTrends } from "./drep-analytics.js";

// Dev analytics tools
import { getDevHealth, getRepoTrends } from "./dev-analytics.js";

// Treasury entity tools
import {
  searchTreasuryEntitiesTool,
  listTreasuryEntitiesTool,
  getEntityProposalsTool,
} from "./treasury.js";

// Export all tools as a registry
export const tools: ToolHandler[] = [
  // Generic tools
  queryDatabase,
  listTables,
  describeTable,
  // Constitution tools
  searchConstitutionTool,
  getConstitutionSection,
  // Vision 2030 tools
  searchVisionTool,
  getVisionSection,
  getVisionKPIs,
  // Voting Principles tools
  searchVotingPrinciplesTool,
  getVotingPrinciplesSection,
  getVotingKPIBudgets,
  getFundingPartitions,
  getVotingCriteria,
  // Voting Rationale tools
  searchVotingRationale,
  getVoteRationale,
  getDrepVotingHistory,
  getProposalRationales,
  getRationaleStats,
  // DRep tools
  searchDreps,
  getDrepProfile,
  getTopDreps,
  // Proposal tools
  searchProposals,
  getProposalDetails,
  getProposalStats,
  // SPO tools
  searchSPOs,
  getTopSPOs,
  getSPOVotingHistory,
  // CC tools
  searchCCMembers,
  getCCVotingHistory,
  getCommitteeState,
  // Analytics tools
  getEpochTotals,
  getNCL,
  getDelegationStats,
  getDevActivity,
  // Participation analytics
  getVotingTurnout,
  getDelegationDistribution,
  getDelegationTrends,
  // Concentration analytics
  getDrepConcentration,
  getSpoEntityConcentration,
  getVoteDivergence,
  // Efficiency analytics
  getTimeToEnactment,
  getContentionRate,
  getGovernanceVolume,
  // CC analytics
  getCCDecisionMetrics,
  getComplianceStatus,
  // DRep analytics
  getDrepActivityRate,
  getDrepRationaleRate,
  getDrepLifecycleTrends,
  // Dev analytics
  getDevHealth,
  getRepoTrends,
  // Treasury entity registry (resolves curated entity slugs / URLs that are
  // NOT in the governance DB — see tools/treasury.ts for why)
  searchTreasuryEntitiesTool,
  listTreasuryEntitiesTool,
  getEntityProposalsTool,
];

// Export individual tools for direct access
export { queryDatabase } from "./query.js";
export { listTables, describeTable } from "./schema.js";
export { searchConstitutionTool, getConstitutionSection } from "./constitution.js";
export { searchVisionTool, getVisionSection, getVisionKPIs } from "./vision.js";
export {
  searchVotingPrinciplesTool,
  getVotingPrinciplesSection,
  getVotingKPIBudgets,
  getFundingPartitions,
  getVotingCriteria,
} from "./voting-principles.js";
export {
  searchVotingRationale,
  getVoteRationale,
  getDrepVotingHistory,
  getProposalRationales,
  getRationaleStats,
} from "./rationale.js";
export { searchDreps, getDrepProfile, getTopDreps } from "./drep.js";
export { searchProposals, getProposalDetails, getProposalStats } from "./proposal.js";
export { searchSPOs, getTopSPOs, getSPOVotingHistory } from "./spo.js";
export { searchCCMembers, getCCVotingHistory, getCommitteeState } from "./cc.js";
export { getEpochTotals, getNCL, getDelegationStats, getDevActivity } from "./analytics.js";
export { getVotingTurnout, getDelegationDistribution, getDelegationTrends } from "./participation.js";
export { getDrepConcentration, getSpoEntityConcentration, getVoteDivergence } from "./concentration.js";
export { getTimeToEnactment, getContentionRate, getGovernanceVolume } from "./efficiency.js";
export { getCCDecisionMetrics, getComplianceStatus } from "./cc-analytics.js";
export { getDrepActivityRate, getDrepRationaleRate, getDrepLifecycleTrends } from "./drep-analytics.js";
export { getDevHealth, getRepoTrends } from "./dev-analytics.js";
export {
  searchTreasuryEntitiesTool,
  listTreasuryEntitiesTool,
  getEntityProposalsTool,
} from "./treasury.js";
