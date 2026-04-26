import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getDrepActivityRate: ToolHandler = {
  definition: {
    name: "get_drep_activity_rate",
    description: `Compute per-DRep activity rate: unique proposals voted on / total eligible proposals.

Uses drep_lifecycle_event registration epoch to determine eligible proposals (only proposals submitted after the DRep registered). Useful for identifying inactive DReps and understanding overall engagement levels.

Note: All monetary/power values (voting_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "Optional: get activity for a specific DRep (if omitted, returns aggregate stats)",
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
        active_only: {
          type: "boolean",
          description: "Only include currently active DReps (default: true)",
        },
        limit: {
          type: "number",
          description: "Maximum DReps to return for aggregate (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { drep_id, governance_action_type, active_only = true, limit = 20 } = args as {
      drep_id?: string;
      governance_action_type?: string;
      active_only?: boolean;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);

    try {
      if (drep_id) {
        // Single DRep activity
        const regResult = await query(
          `SELECT MIN(epoch_no) as registration_epoch
           FROM drep_lifecycle_event
           WHERE drep_id = $1 AND action = 'registration'`,
          [drep_id]
        );
        const regEpoch = regResult.rows[0]?.registration_epoch;

        const proposalParams: unknown[] = [];
        let proposalFilter = "";
        let paramIndex = 1;

        if (regEpoch) {
          proposalFilter = `WHERE submission_epoch >= $${paramIndex}`;
          proposalParams.push(regEpoch);
          paramIndex++;
        }
        if (governance_action_type) {
          proposalFilter += regEpoch ? ` AND` : `WHERE`;
          proposalFilter += ` governance_action_type = $${paramIndex}`;
          proposalParams.push(governance_action_type);
        }

        const totalProposals = await query(
          `SELECT COUNT(*) as count FROM proposal ${proposalFilter}`,
          proposalParams
        );

        const voteParams: unknown[] = [drep_id];
        let voteFilter = "";
        if (governance_action_type) {
          voteFilter = ` AND p.governance_action_type = $2`;
          voteParams.push(governance_action_type);
        }

        const votedProposals = await query(
          `SELECT COUNT(DISTINCT v.proposal_id) as count
           FROM onchain_vote v
           JOIN proposal p ON v.proposal_id = p.proposal_id
           WHERE v.drep_id = $1${voteFilter}`,
          voteParams
        );

        const total = parseInt(totalProposals.rows[0]?.count || "0");
        const voted = parseInt(votedProposals.rows[0]?.count || "0");
        const activityRate = total > 0 ? (voted / total) * 100 : null;

        return createJsonResult({
          drep_id,
          registration_epoch: regEpoch,
          eligible_proposals: total,
          proposals_voted: voted,
          activity_rate_pct: activityRate !== null ? parseFloat(activityRate.toFixed(2)) : null,
        });
      }

      // Aggregate: top/bottom DReps by activity rate
      const activeFilter = active_only ? `AND d.active = true` : "";
      const gatFilter = governance_action_type ? `AND p.governance_action_type = $1` : "";
      const gatParams: unknown[] = governance_action_type ? [governance_action_type] : [];

      const sql = `
        WITH drep_reg AS (
          SELECT drep_id, MIN(epoch_no) as registration_epoch
          FROM drep_lifecycle_event
          WHERE action = 'registration'
          GROUP BY drep_id
        ),
        drep_votes AS (
          SELECT
            v.drep_id,
            COUNT(DISTINCT v.proposal_id) as proposals_voted
          FROM onchain_vote v
          JOIN proposal p ON v.proposal_id = p.proposal_id
          WHERE v.voter_type = 'DREP' ${gatFilter}
          GROUP BY v.drep_id
        ),
        total_proposals AS (
          SELECT COUNT(*) as total FROM proposal
          ${governance_action_type ? `WHERE governance_action_type = $1` : ""}
        )
        SELECT
          d.drep_id,
          d.name,
          d.voting_power,
          d.active,
          COALESCE(dv.proposals_voted, 0) as proposals_voted,
          tp.total as total_proposals,
          dr.registration_epoch
        FROM drep d
        LEFT JOIN drep_votes dv ON d.drep_id = dv.drep_id
        LEFT JOIN drep_reg dr ON d.drep_id = dr.drep_id
        CROSS JOIN total_proposals tp
        WHERE d.voting_power > 0 ${activeFilter}
        ORDER BY COALESCE(dv.proposals_voted, 0)::float / GREATEST(tp.total, 1) DESC
        LIMIT $${gatParams.length + 1}
      `;

      const result = await query(sql, [...gatParams, maxLimit]);

      return createJsonResult({
        total_results: result.rows.length,
        dreps: result.rows.map((r) => {
          const voted = parseInt(r.proposals_voted);
          const total = parseInt(r.total_proposals);
          const rate = total > 0 ? (voted / total) * 100 : null;
          return {
            drep_id: r.drep_id,
            name: r.name,
            voting_power: r.voting_power?.toString(),
            active: r.active,
            registration_epoch: r.registration_epoch,
            proposals_voted: voted,
            total_proposals: total,
            activity_rate_pct: rate !== null ? parseFloat(rate.toFixed(2)) : null,
          };
        }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing DRep activity rate: ${errorMessage}`, true);
    }
  },
};

export const getDrepRationaleRate: ToolHandler = {
  definition: {
    name: "get_drep_rationale_rate",
    description: `Compute per-DRep rationale provision rate: votes with rationale or anchor_url / total votes.

Higher rationale rates indicate more transparent and accountable DReps. Useful for evaluating DRep quality and governance transparency.

Note: All monetary/power values (voting_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "Optional: get rationale rate for a specific DRep",
        },
        min_votes: {
          type: "number",
          description: "Minimum total votes to include (filters out low-activity DReps, default: 1)",
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
    const { drep_id, min_votes = 1, limit = 20 } = args as {
      drep_id?: string;
      min_votes?: number;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);

    try {
      if (drep_id) {
        const result = await query(
          `SELECT
            COUNT(*) as total_votes,
            COUNT(*) FILTER (WHERE rationale IS NOT NULL OR anchor_url IS NOT NULL) as with_rationale
           FROM onchain_vote
           WHERE drep_id = $1 AND voter_type = 'DREP'`,
          [drep_id]
        );

        const total = parseInt(result.rows[0]?.total_votes || "0");
        const withRationale = parseInt(result.rows[0]?.with_rationale || "0");
        const rate = total > 0 ? (withRationale / total) * 100 : null;

        return createJsonResult({
          drep_id,
          total_votes: total,
          votes_with_rationale: withRationale,
          rationale_rate_pct: rate !== null ? parseFloat(rate.toFixed(2)) : null,
        });
      }

      const sql = `
        SELECT
          v.drep_id,
          d.name,
          d.voting_power,
          COUNT(*) as total_votes,
          COUNT(*) FILTER (WHERE v.rationale IS NOT NULL OR v.anchor_url IS NOT NULL) as with_rationale
        FROM onchain_vote v
        JOIN drep d ON v.drep_id = d.drep_id
        WHERE v.voter_type = 'DREP'
        GROUP BY v.drep_id, d.name, d.voting_power
        HAVING COUNT(*) >= $1
        ORDER BY COUNT(*) FILTER (WHERE v.rationale IS NOT NULL OR v.anchor_url IS NOT NULL)::float / COUNT(*) DESC
        LIMIT $2
      `;

      const result = await query(sql, [min_votes, maxLimit]);

      return createJsonResult({
        total_results: result.rows.length,
        dreps: result.rows.map((r) => {
          const total = parseInt(r.total_votes);
          const withRationale = parseInt(r.with_rationale);
          const rate = total > 0 ? (withRationale / total) * 100 : null;
          return {
            drep_id: r.drep_id,
            name: r.name,
            voting_power: r.voting_power?.toString(),
            total_votes: total,
            votes_with_rationale: withRationale,
            rationale_rate_pct: rate !== null ? parseFloat(rate.toFixed(2)) : null,
          };
        }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing DRep rationale rate: ${errorMessage}`, true);
    }
  },
};

export const getDrepLifecycleTrends: ToolHandler = {
  definition: {
    name: "get_drep_lifecycle_trends",
    description: `Get DRep registration/deregistration/update counts per epoch.

Shows net new DReps per epoch from drep_lifecycle_event table. Useful for tracking DRep ecosystem growth and churn.`,
    inputSchema: {
      type: "object",
      properties: {
        from_epoch: {
          type: "number",
          description: "Start epoch (inclusive)",
        },
        to_epoch: {
          type: "number",
          description: "End epoch (inclusive)",
        },
        limit: {
          type: "number",
          description: "Maximum epochs to return (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { from_epoch, to_epoch, limit = 20 } = args as {
      from_epoch?: number;
      to_epoch?: number;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (from_epoch !== undefined) {
      conditions.push(`epoch_no >= $${paramIndex}`);
      params.push(from_epoch);
      paramIndex++;
    }
    if (to_epoch !== undefined) {
      conditions.push(`epoch_no <= $${paramIndex}`);
      params.push(to_epoch);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        epoch_no,
        action,
        COUNT(*) as count
      FROM drep_lifecycle_event
      ${whereClause}
      GROUP BY epoch_no, action
      ORDER BY epoch_no DESC, action
    `;

    try {
      const result = await query(sql, params);

      // Group by epoch
      const byEpoch: Record<number, Record<string, number>> = {};
      for (const row of result.rows) {
        const epoch = row.epoch_no;
        if (!byEpoch[epoch]) byEpoch[epoch] = {};
        byEpoch[epoch][row.action] = parseInt(row.count);
      }

      const epochs = Object.entries(byEpoch)
        .sort(([a], [b]) => Number(b) - Number(a))
        .slice(0, maxLimit)
        .map(([epoch, actions]) => {
          const registered = actions["registration"] || 0;
          const deregistered = actions["deregistration"] || 0;
          const updated = actions["update"] || 0;
          return {
            epoch: Number(epoch),
            registered,
            deregistered,
            updated,
            net_new: registered - deregistered,
          };
        });

      const totalRegistered = epochs.reduce((sum, e) => sum + e.registered, 0);
      const totalDeregistered = epochs.reduce((sum, e) => sum + e.deregistered, 0);

      return createJsonResult({
        summary: {
          total_registered: totalRegistered,
          total_deregistered: totalDeregistered,
          net_new: totalRegistered - totalDeregistered,
        },
        epochs,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting DRep lifecycle trends: ${errorMessage}`, true);
    }
  },
};
