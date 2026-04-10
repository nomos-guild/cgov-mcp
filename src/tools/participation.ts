import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getVotingTurnout: ToolHandler = {
  definition: {
    name: "get_voting_turnout",
    description: `Compute DRep and SPO voting turnout per proposal using pre-stored vote power fields.

DRep turnout = (active_yes + active_no + active_abstain) / drep_total_vote_power
SPO turnout = (active_yes + active_no + active_abstain) / spo_total_vote_power

Returns turnout percentages for each proposal. Useful for understanding governance participation levels and comparing engagement across proposal types.

Note: All monetary/power values (vote_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
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
          description: "Optional: filter by governance action type",
        },
        status: {
          type: "string",
          enum: ["RATIFIED", "ENACTED", "EXPIRED", "ACTIVE"],
          description: "Optional: filter by proposal status",
        },
        proposal_id: {
          type: "string",
          description: "Optional: get turnout for a specific proposal",
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
    const { governance_action_type, status, proposal_id, limit = 20 } = args as {
      governance_action_type?: string;
      status?: string;
      proposal_id?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (proposal_id) {
      conditions.push(`proposal_id = $${paramIndex}`);
      params.push(proposal_id);
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

    const sql = `
      SELECT
        proposal_id, title, governance_action_type, status,
        drep_active_yes_vote_power, drep_active_no_vote_power, drep_active_abstain_vote_power,
        drep_total_vote_power,
        spo_active_yes_vote_power, spo_active_no_vote_power, spo_active_abstain_vote_power,
        spo_total_vote_power
      FROM proposal
      ${whereClause}
      ORDER BY created_at DESC NULLS LAST
      LIMIT $${paramIndex}
    `;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No proposals found matching criteria");
      }

      const proposals = result.rows.map((r) => {
        const drepActive =
          (Number(r.drep_active_yes_vote_power) || 0) +
          (Number(r.drep_active_no_vote_power) || 0) +
          (Number(r.drep_active_abstain_vote_power) || 0);
        const drepTotal = Number(r.drep_total_vote_power) || 0;
        const drepTurnout = drepTotal > 0 ? (drepActive / drepTotal) * 100 : null;

        const spoActive =
          (Number(r.spo_active_yes_vote_power) || 0) +
          (Number(r.spo_active_no_vote_power) || 0) +
          (Number(r.spo_active_abstain_vote_power) || 0);
        const spoTotal = Number(r.spo_total_vote_power) || 0;
        const spoTurnout = spoTotal > 0 ? (spoActive / spoTotal) * 100 : null;

        return {
          proposal_id: r.proposal_id,
          title: r.title,
          governance_action_type: r.governance_action_type,
          status: r.status,
          drep: {
            active_vote_power: drepActive.toString(),
            total_vote_power: drepTotal.toString(),
            turnout_pct: drepTurnout !== null ? parseFloat(drepTurnout.toFixed(2)) : null,
          },
          spo: {
            active_vote_power: spoActive.toString(),
            total_vote_power: spoTotal.toString(),
            turnout_pct: spoTurnout !== null ? parseFloat(spoTurnout.toFixed(2)) : null,
          },
        };
      });

      return createJsonResult({
        total_results: proposals.length,
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing voting turnout: ${errorMessage}`, true);
    }
  },
};

export const getDelegationDistribution: ToolHandler = {
  definition: {
    name: "get_delegation_distribution",
    description: `Get delegation distribution by wallet size bands.

Bands: 0-1k ADA, 1k-10k, 10k-100k, 100k-1M, 1M+ ADA.
Shows how many delegators and total stake fall into each band.
Useful for understanding whether governance power is concentrated among whales or distributed across small holders.

Note: All monetary/power values (stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "Optional: filter to see one DRep's delegator distribution",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { drep_id } = args as { drep_id?: string };

    const params: unknown[] = [];
    const drepFilter = drep_id ? `WHERE drep_id = $1` : "";
    if (drep_id) params.push(drep_id);

    const sql = `
      SELECT
        CASE
          WHEN amount / 1000000 < 1000 THEN '0-1k ADA'
          WHEN amount / 1000000 < 10000 THEN '1k-10k ADA'
          WHEN amount / 1000000 < 100000 THEN '10k-100k ADA'
          WHEN amount / 1000000 < 1000000 THEN '100k-1M ADA'
          ELSE '1M+ ADA'
        END as band,
        COUNT(*) as delegator_count,
        SUM(amount) as total_stake,
        AVG(amount) as avg_stake,
        MIN(amount) as min_stake,
        MAX(amount) as max_stake
      FROM stake_delegation_state
      ${drepFilter}
      GROUP BY band
      ORDER BY MIN(amount)
    `;

    try {
      const result = await query(sql, params);

      const totalDelegators = result.rows.reduce((sum, r) => sum + parseInt(r.delegator_count), 0);
      const totalStake = result.rows.reduce((sum, r) => sum + Number(r.total_stake), 0);

      return createJsonResult({
        drep_id: drep_id || "all",
        total_delegators: totalDelegators,
        total_stake: totalStake.toString(),
        bands: result.rows.map((r) => ({
          band: r.band,
          delegator_count: parseInt(r.delegator_count),
          delegator_pct: parseFloat(((parseInt(r.delegator_count) / totalDelegators) * 100).toFixed(2)),
          total_stake: r.total_stake?.toString(),
          stake_pct: parseFloat(((Number(r.total_stake) / totalStake) * 100).toFixed(2)),
          avg_stake_ada: parseFloat((Number(r.avg_stake) / 1000000).toFixed(2)),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting delegation distribution: ${errorMessage}`, true);
    }
  },
};

export const getDelegationTrends: ToolHandler = {
  definition: {
    name: "get_delegation_trends",
    description: `Get per-epoch delegation rate trends from epoch_totals.

Returns delegated DRep power as a percentage of circulation per epoch, plus special DRep counts (always_abstain, always_no_confidence). Useful for tracking governance participation growth over time.

Note: All monetary/power values (delegated_drep_power, circulation, voting_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
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
        circulation,
        delegated_drep_power,
        total_pool_vote_power,
        drep_always_abstain_delegator_count,
        drep_always_abstain_voting_power,
        drep_always_no_confidence_delegator_count,
        drep_always_no_confidence_voting_power,
        start_time
      FROM epoch_totals
      ${whereClause}
      ORDER BY epoch_no DESC
      LIMIT $${paramIndex}
    `;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No epoch data found for the specified range");
      }

      return createJsonResult({
        epochs: result.rows.map((e) => {
          const circulation = Number(e.circulation) || 0;
          const drepPower = Number(e.delegated_drep_power) || 0;
          const delegationRate = circulation > 0 ? (drepPower / circulation) * 100 : null;

          return {
            epoch: e.epoch_no,
            start_time: e.start_time,
            delegated_drep_power: drepPower.toString(),
            circulation: circulation.toString(),
            delegation_rate_pct: delegationRate !== null ? parseFloat(delegationRate.toFixed(2)) : null,
            total_pool_vote_power: e.total_pool_vote_power?.toString(),
            special_dreps: {
              always_abstain: {
                delegator_count: e.drep_always_abstain_delegator_count,
                voting_power: e.drep_always_abstain_voting_power?.toString(),
              },
              always_no_confidence: {
                delegator_count: e.drep_always_no_confidence_delegator_count,
                voting_power: e.drep_always_no_confidence_voting_power?.toString(),
              },
            },
          };
        }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting delegation trends: ${errorMessage}`, true);
    }
  },
};
