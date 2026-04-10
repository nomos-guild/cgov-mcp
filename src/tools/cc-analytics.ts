import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getCCDecisionMetrics: ToolHandler = {
  definition: {
    name: "get_cc_decision_metrics",
    description: `Get Constitutional Committee decision metrics per proposal.

Returns:
- CC participation rate (votes cast / total CC members)
- Abstain rate
- Agreement rate (how aligned CC members are)
- Time from proposal creation to first/last CC vote

Useful for evaluating CC engagement and responsiveness.`,
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: {
          type: "string",
          description: "Optional: get metrics for a specific proposal",
        },
        governance_action_type: {
          type: "string",
          enum: [
            "INFO_ACTION",
            "TREASURY_WITHDRAWALS",
            "NEW_CONSTITUTION",
            "HARD_FORK_INITIATION",
            "PROTOCOL_PARAMETER_CHANGE",
            "NO_CONFIDENCE",
            "UPDATE_COMMITTEE",
          ],
          description: "Optional: filter by governance action type",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { proposal_id, governance_action_type, limit = 20 } = args as {
      proposal_id?: string;
      governance_action_type?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);

    try {
      // Get total CC members count
      const ccCountResult = await query(
        `SELECT COUNT(*) as total FROM cc WHERE status = 'ACTIVE' OR status IS NULL`
      );
      const totalCCMembers = parseInt(ccCountResult.rows[0]?.total || "0");

      const params: unknown[] = [];
      let paramIndex = 1;
      const conditions: string[] = ["v.voter_type = 'CC'"];

      if (proposal_id) {
        conditions.push(`v.proposal_id = $${paramIndex}`);
        params.push(proposal_id);
        paramIndex++;
      }
      if (governance_action_type) {
        conditions.push(`p.governance_action_type = $${paramIndex}`);
        params.push(governance_action_type);
        paramIndex++;
      }

      const sql = `
        SELECT
          v.proposal_id,
          p.title,
          p.governance_action_type,
          p.status as proposal_status,
          p.created_at as proposal_created_at,
          COUNT(*) as total_cc_votes,
          COUNT(*) FILTER (WHERE v.vote = 'YES') as yes_votes,
          COUNT(*) FILTER (WHERE v.vote = 'NO') as no_votes,
          COUNT(*) FILTER (WHERE v.vote = 'ABSTAIN') as abstain_votes,
          MIN(v.voted_at) as first_vote_at,
          MAX(v.voted_at) as last_vote_at
        FROM onchain_vote v
        JOIN proposal p ON v.proposal_id = p.proposal_id
        WHERE ${conditions.join(" AND ")}
        GROUP BY v.proposal_id, p.title, p.governance_action_type, p.status, p.created_at
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT $${paramIndex}
      `;
      params.push(maxLimit);

      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No CC voting data found matching criteria");
      }

      const proposals = result.rows.map((r) => {
        const totalVotes = parseInt(r.total_cc_votes);
        const yesVotes = parseInt(r.yes_votes);
        const noVotes = parseInt(r.no_votes);
        const abstainVotes = parseInt(r.abstain_votes);
        const participationRate = totalCCMembers > 0 ? (totalVotes / totalCCMembers) * 100 : null;
        const abstainRate = totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : null;

        // Agreement = max vote share (how aligned CC members are)
        const maxVote = Math.max(yesVotes, noVotes, abstainVotes);
        const agreementRate = totalVotes > 0 ? (maxVote / totalVotes) * 100 : null;

        let daysToFirstVote: number | null = null;
        if (r.first_vote_at && r.proposal_created_at) {
          daysToFirstVote = parseFloat(
            ((new Date(r.first_vote_at).getTime() - new Date(r.proposal_created_at).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
          );
        }

        let daysToLastVote: number | null = null;
        if (r.last_vote_at && r.proposal_created_at) {
          daysToLastVote = parseFloat(
            ((new Date(r.last_vote_at).getTime() - new Date(r.proposal_created_at).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
          );
        }

        return {
          proposal_id: r.proposal_id,
          title: r.title,
          governance_action_type: r.governance_action_type,
          status: r.proposal_status,
          cc_votes: {
            total: totalVotes,
            yes: yesVotes,
            no: noVotes,
            abstain: abstainVotes,
          },
          participation_rate_pct: participationRate !== null ? parseFloat(participationRate.toFixed(2)) : null,
          abstain_rate_pct: abstainRate !== null ? parseFloat(abstainRate.toFixed(2)) : null,
          agreement_rate_pct: agreementRate !== null ? parseFloat(agreementRate.toFixed(2)) : null,
          response_time: {
            days_to_first_vote: daysToFirstVote,
            days_to_last_vote: daysToLastVote,
          },
        };
      });

      return createJsonResult({
        total_cc_members: totalCCMembers,
        total_results: proposals.length,
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting CC decision metrics: ${errorMessage}`, true);
    }
  },
};

export const getComplianceStatus: ToolHandler = {
  definition: {
    name: "get_compliance_status",
    description: `Get CC constitutional/unconstitutional verdicts per proposal.

Determines if CC has reached the 67% quorum threshold for each proposal.
A proposal is "constitutional" if >= 67% of CC votes are YES, "unconstitutional" if >= 67% are NO.

Useful for tracking CC constitutional review outcomes and identifying proposals that failed constitutional review.`,
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["RATIFIED", "ENACTED", "EXPIRED", "ACTIVE"],
          description: "Optional: filter by proposal status",
        },
        governance_action_type: {
          type: "string",
          enum: [
            "INFO_ACTION",
            "TREASURY_WITHDRAWALS",
            "NEW_CONSTITUTION",
            "HARD_FORK_INITIATION",
            "PROTOCOL_PARAMETER_CHANGE",
            "NO_CONFIDENCE",
            "UPDATE_COMMITTEE",
          ],
          description: "Optional: filter by governance action type",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { status, governance_action_type, limit = 20 } = args as {
      status?: string;
      governance_action_type?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = ["v.voter_type = 'CC'"];

    if (status) {
      conditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (governance_action_type) {
      conditions.push(`p.governance_action_type = $${paramIndex}`);
      params.push(governance_action_type);
      paramIndex++;
    }

    const sql = `
      SELECT
        v.proposal_id,
        p.title,
        p.governance_action_type,
        p.status as proposal_status,
        COUNT(*) as total_cc_votes,
        COUNT(*) FILTER (WHERE v.vote = 'YES') as yes_votes,
        COUNT(*) FILTER (WHERE v.vote = 'NO') as no_votes,
        COUNT(*) FILTER (WHERE v.vote = 'ABSTAIN') as abstain_votes
      FROM onchain_vote v
      JOIN proposal p ON v.proposal_id = p.proposal_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY v.proposal_id, p.title, p.governance_action_type, p.status, p.created_at
      ORDER BY p.created_at DESC NULLS LAST
      LIMIT $${paramIndex}
    `;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No CC voting data found matching criteria");
      }

      const proposals = result.rows.map((r) => {
        const total = parseInt(r.total_cc_votes);
        const yes = parseInt(r.yes_votes);
        const no = parseInt(r.no_votes);
        const abstain = parseInt(r.abstain_votes);
        const nonAbstain = yes + no;

        const yesPct = nonAbstain > 0 ? (yes / nonAbstain) * 100 : 0;
        const noPct = nonAbstain > 0 ? (no / nonAbstain) * 100 : 0;

        let verdict: string;
        if (nonAbstain === 0) {
          verdict = "NO_VERDICT";
        } else if (yesPct >= 67) {
          verdict = "CONSTITUTIONAL";
        } else if (noPct >= 67) {
          verdict = "UNCONSTITUTIONAL";
        } else {
          verdict = "NO_QUORUM";
        }

        return {
          proposal_id: r.proposal_id,
          title: r.title,
          governance_action_type: r.governance_action_type,
          proposal_status: r.proposal_status,
          cc_votes: { total, yes, no, abstain },
          yes_pct_of_non_abstain: parseFloat(yesPct.toFixed(2)),
          no_pct_of_non_abstain: parseFloat(noPct.toFixed(2)),
          verdict,
          quorum_met: yesPct >= 67 || noPct >= 67,
        };
      });

      const verdictCounts = {
        CONSTITUTIONAL: proposals.filter((p) => p.verdict === "CONSTITUTIONAL").length,
        UNCONSTITUTIONAL: proposals.filter((p) => p.verdict === "UNCONSTITUTIONAL").length,
        NO_QUORUM: proposals.filter((p) => p.verdict === "NO_QUORUM").length,
        NO_VERDICT: proposals.filter((p) => p.verdict === "NO_VERDICT").length,
      };

      return createJsonResult({
        total_results: proposals.length,
        verdict_summary: verdictCounts,
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting compliance status: ${errorMessage}`, true);
    }
  },
};
