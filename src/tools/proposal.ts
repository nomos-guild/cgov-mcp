import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

// Round to 1 decimal place. Returns null if the input is null.
function pct(num: bigint, denom: bigint): number | null {
  if (denom === 0n) return null;
  // Scale by 1000 then divide for one decimal place; avoids float precision loss on large BigInts.
  return Number((num * 1000n) / denom) / 10;
}

function toBig(v: unknown): bigint {
  if (v === null || v === undefined) return 0n;
  try {
    return BigInt(typeof v === "string" ? v : String(v));
  } catch {
    return 0n;
  }
}

interface VoteStats {
  active_total: string;        // yes + no + abstain, in lovelace
  yes_pct_of_active: number | null;
  no_pct_of_active: number | null;
  abstain_pct_of_active: number | null;
  participation_pct: number | null;  // active_total / total_power
}

function computeVoteStats(
  yes: unknown,
  no: unknown,
  abstain: unknown,
  total: unknown
): VoteStats {
  const y = toBig(yes);
  const n = toBig(no);
  const a = toBig(abstain);
  const t = toBig(total);
  const active = y + n + a;
  return {
    active_total: active.toString(),
    yes_pct_of_active: pct(y, active),
    no_pct_of_active: pct(n, active),
    abstain_pct_of_active: pct(a, active),
    participation_pct: pct(active, t),
  };
}

export const searchProposals: ToolHandler = {
  definition: {
    name: "search_proposals",
    description: `Search governance proposals by title, description, type, or status.

Returns proposals with:
- Title, description, and rationale
- Governance action type (INFO_ACTION, TREASURY_WITHDRAWALS, etc.)
- Withdrawal amount (for TREASURY_WITHDRAWALS proposals)
- Status (ACTIVE, RATIFIED, ENACTED, EXPIRED, DROPPED, CLOSED)
- Epoch milestones (submission, ratification, enactment, expiration)
- Vote power breakdowns for DReps and SPOs, plus pre-computed percentages
- Linked CIP-179 survey transaction (if any)

Notes:
- All raw power/amount values (voting_power, withdrawal_amount) are in lovelace. Divide by 1,000,000 for ADA.
- For describing the verdict, prefer the pre-computed yes/no/abstain percentages over raw amounts — DRep totals can run into the billions of ADA and "1.6B No vs 411M Yes" reads as scary numbers when the relevant signal is "80% No, 20% Yes". The fields drep_votes.{yes,no,abstain}_pct_of_active and drep_votes.participation_pct are already calculated for you.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - keywords from title or description",
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
          description: "Filter by governance action type",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "RATIFIED", "ENACTED", "EXPIRED", "DROPPED", "CLOSED"],
          description: "Filter by proposal status",
        },
        sort_by: {
          type: "string",
          enum: ["newest", "oldest", "most_votes"],
          description: "Sort order (default: newest)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const {
      query: searchQuery,
      governance_action_type,
      status,
      sort_by = "newest",
      limit = 20,
    } = args as {
      query?: string;
      governance_action_type?: string;
      status?: string;
      sort_by?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (searchQuery) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    if (governance_action_type) {
      conditions.push(`governance_action_type = $${paramIndex}`);
      params.push(governance_action_type);
      paramIndex++;
    }

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const orderClause =
      sort_by === "oldest"
        ? "ORDER BY created_at ASC"
        : sort_by === "most_votes"
          ? "ORDER BY drep_total_vote_power DESC NULLS LAST"
          : "ORDER BY created_at DESC";

    const sql = `
      SELECT
        proposal_id,
        tx_hash,
        cert_index,
        title,
        description,
        rationale,
        governance_action_type,
        withdrawal_amount,
        status,
        submission_epoch,
        ratified_epoch,
        enacted_epoch,
        dropped_epoch,
        expired_epoch,
        expiration_epoch,
        drep_total_vote_power,
        drep_active_yes_vote_power,
        drep_active_no_vote_power,
        drep_active_abstain_vote_power,
        drep_always_abstain_vote_power,
        drep_always_no_confidence_power,
        drep_inactive_vote_power,
        spo_total_vote_power,
        spo_active_yes_vote_power,
        spo_active_no_vote_power,
        spo_active_abstain_vote_power,
        spo_always_abstain_vote_power,
        spo_always_no_confidence_power,
        spo_no_vote_power,
        linked_survey_tx_id,
        created_at,
        updated_at
      FROM proposal
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex}
    `;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult(
          `No proposals found${searchQuery ? ` matching "${searchQuery}"` : ""}${governance_action_type ? ` of type ${governance_action_type}` : ""}${status ? ` with status ${status}` : ""}`
        );
      }

      return createJsonResult({
        total_results: result.rows.length,
        proposals: result.rows.map((p) => ({
          proposal_id: p.proposal_id,
          tx_hash: p.tx_hash,
          title: p.title,
          description: p.description?.substring(0, 500),
          rationale: p.rationale?.substring(0, 500),
          governance_action_type: p.governance_action_type,
          withdrawal_amount: p.withdrawal_amount?.toString(),
          status: p.status,
          linked_survey_tx_id: p.linked_survey_tx_id,
          epochs: {
            submission: p.submission_epoch,
            ratified: p.ratified_epoch,
            enacted: p.enacted_epoch,
            dropped: p.dropped_epoch,
            expired: p.expired_epoch,
            expiration: p.expiration_epoch,
          },
          drep_votes: {
            total_power: p.drep_total_vote_power?.toString(),
            yes_power: p.drep_active_yes_vote_power?.toString(),
            no_power: p.drep_active_no_vote_power?.toString(),
            abstain_power: p.drep_active_abstain_vote_power?.toString(),
            always_abstain_power: p.drep_always_abstain_vote_power?.toString(),
            always_no_confidence_power: p.drep_always_no_confidence_power?.toString(),
            inactive_power: p.drep_inactive_vote_power?.toString(),
            ...computeVoteStats(
              p.drep_active_yes_vote_power,
              p.drep_active_no_vote_power,
              p.drep_active_abstain_vote_power,
              p.drep_total_vote_power
            ),
          },
          spo_votes: {
            total_power: p.spo_total_vote_power?.toString(),
            yes_power: p.spo_active_yes_vote_power?.toString(),
            no_power: p.spo_active_no_vote_power?.toString(),
            abstain_power: p.spo_active_abstain_vote_power?.toString(),
            always_abstain_power: p.spo_always_abstain_vote_power?.toString(),
            always_no_confidence_power: p.spo_always_no_confidence_power?.toString(),
            no_vote_power: p.spo_no_vote_power?.toString(),
            ...computeVoteStats(
              p.spo_active_yes_vote_power,
              p.spo_active_no_vote_power,
              p.spo_active_abstain_vote_power,
              p.spo_total_vote_power
            ),
          },
          created_at: p.created_at,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching proposals: ${errorMessage}`, true);
    }
  },
};

export const getProposalDetails: ToolHandler = {
  definition: {
    name: "get_proposal_details",
    description: `Get full details of a specific governance proposal by ID.

Returns complete proposal data including:
- Full title, description, and rationale text
- Withdrawal amount (for TREASURY_WITHDRAWALS proposals)
- CIP-179 survey link/details (if any)
- Vote power breakdowns for DReps and SPOs, plus pre-computed percentages
- Epoch milestones (submission through enactment/expiration)
- Vote counts by voter type

Notes:
- All raw power/amount values (voting_power, withdrawal_amount) are in lovelace. Divide by 1,000,000 for ADA.
- For describing the verdict, prefer the pre-computed yes/no/abstain percentages over raw amounts — DRep totals can run into the billions of ADA and "1.6B No vs 411M Yes" reads as scary numbers when the relevant signal is "80% No, 20% Yes". The fields drep_votes.{yes,no,abstain}_pct_of_active and drep_votes.participation_pct are already calculated for you.`,
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: {
          type: "string",
          description: "The proposal ID to retrieve",
        },
      },
      required: ["proposal_id"],
    },
  },
  handler: async (args) => {
    const { proposal_id } = args as { proposal_id: string };

    try {
      const proposalResult = await query(
        `SELECT * FROM proposal WHERE proposal_id = $1`,
        [proposal_id]
      );

      if (proposalResult.rows.length === 0) {
        return createTextResult(`Proposal not found: ${proposal_id}`, true);
      }

      const p = proposalResult.rows[0];

      // Get vote counts
      const voteStats = await query(
        `SELECT
          voter_type,
          vote,
          COUNT(*) as count,
          SUM(voting_power) as total_power
        FROM onchain_vote
        WHERE proposal_id = $1
        GROUP BY voter_type, vote
        ORDER BY voter_type, vote`,
        [proposal_id]
      );

      return createJsonResult({
        proposal: {
          proposal_id: p.proposal_id,
          tx_hash: p.tx_hash,
          cert_index: p.cert_index,
          title: p.title,
          description: p.description,
          rationale: p.rationale,
          governance_action_type: p.governance_action_type,
          withdrawal_amount: p.withdrawal_amount?.toString(),
          status: p.status,
          metadata: p.metadata,
          linked_survey_tx_id: p.linked_survey_tx_id,
          survey_details: p.survey_details,
          epochs: {
            submission: p.submission_epoch,
            ratified: p.ratified_epoch,
            enacted: p.enacted_epoch,
            dropped: p.dropped_epoch,
            expired: p.expired_epoch,
            expiration: p.expiration_epoch,
          },
          drep_votes: {
            total_power: p.drep_total_vote_power?.toString(),
            yes_power: p.drep_active_yes_vote_power?.toString(),
            no_power: p.drep_active_no_vote_power?.toString(),
            abstain_power: p.drep_active_abstain_vote_power?.toString(),
            always_abstain_power: p.drep_always_abstain_vote_power?.toString(),
            always_no_confidence_power: p.drep_always_no_confidence_power?.toString(),
            inactive_power: p.drep_inactive_vote_power?.toString(),
            ...computeVoteStats(
              p.drep_active_yes_vote_power,
              p.drep_active_no_vote_power,
              p.drep_active_abstain_vote_power,
              p.drep_total_vote_power
            ),
          },
          spo_votes: {
            total_power: p.spo_total_vote_power?.toString(),
            yes_power: p.spo_active_yes_vote_power?.toString(),
            no_power: p.spo_active_no_vote_power?.toString(),
            abstain_power: p.spo_active_abstain_vote_power?.toString(),
            always_abstain_power: p.spo_always_abstain_vote_power?.toString(),
            always_no_confidence_power: p.spo_always_no_confidence_power?.toString(),
            no_vote_power: p.spo_no_vote_power?.toString(),
            ...computeVoteStats(
              p.spo_active_yes_vote_power,
              p.spo_active_no_vote_power,
              p.spo_active_abstain_vote_power,
              p.spo_total_vote_power
            ),
          },
        },
        vote_counts: voteStats.rows.map((r) => ({
          voter_type: r.voter_type,
          vote: r.vote,
          count: parseInt(r.count),
          total_power: r.total_power?.toString(),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting proposal details: ${errorMessage}`, true);
    }
  },
};

export const getProposalStats: ToolHandler = {
  definition: {
    name: "get_proposal_stats",
    description: `Get aggregate statistics about governance proposals.

Returns:
- Total proposals by type and status
- Average time from submission to ratification/enactment
- Active proposals summary`,
    inputSchema: {
      type: "object",
      properties: {
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
          description: "Optional: filter stats by governance action type",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { governance_action_type } = args as { governance_action_type?: string };

    try {
      const params: unknown[] = [];
      let typeFilter = "";
      if (governance_action_type) {
        typeFilter = "WHERE governance_action_type = $1";
        params.push(governance_action_type);
      }

      const byStatus = await query(
        `SELECT status, COUNT(*) as count
         FROM proposal ${typeFilter}
         GROUP BY status ORDER BY count DESC`,
        params
      );

      const byType = await query(
        `SELECT governance_action_type, status, COUNT(*) as count
         FROM proposal
         GROUP BY governance_action_type, status
         ORDER BY governance_action_type, count DESC`
      );

      const epochStats = await query(
        `SELECT
          governance_action_type,
          AVG(ratified_epoch - submission_epoch) as avg_epochs_to_ratify,
          AVG(enacted_epoch - submission_epoch) as avg_epochs_to_enact,
          COUNT(*) FILTER (WHERE ratified_epoch IS NOT NULL) as ratified_count,
          COUNT(*) FILTER (WHERE enacted_epoch IS NOT NULL) as enacted_count
        FROM proposal
        WHERE submission_epoch IS NOT NULL
        GROUP BY governance_action_type`
      );

      return createJsonResult({
        by_status: byStatus.rows.map((r) => ({
          status: r.status,
          count: parseInt(r.count),
        })),
        by_type_and_status: byType.rows.map((r) => ({
          governance_action_type: r.governance_action_type,
          status: r.status,
          count: parseInt(r.count),
        })),
        epoch_metrics: epochStats.rows.map((r) => ({
          governance_action_type: r.governance_action_type,
          avg_epochs_to_ratify: r.avg_epochs_to_ratify ? parseFloat(r.avg_epochs_to_ratify).toFixed(1) : null,
          avg_epochs_to_enact: r.avg_epochs_to_enact ? parseFloat(r.avg_epochs_to_enact).toFixed(1) : null,
          ratified_count: parseInt(r.ratified_count),
          enacted_count: parseInt(r.enacted_count),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting proposal stats: ${errorMessage}`, true);
    }
  },
};
