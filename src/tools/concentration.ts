import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  if (sum === 0) return 0;

  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return numerator / (n * sum);
}

export const getDrepConcentration: ToolHandler = {
  definition: {
    name: "get_drep_concentration",
    description: `Compute DRep voting power concentration metrics including top-N cumulative share and Gini coefficient.

The Gini coefficient ranges from 0 (perfectly equal) to 1 (maximally concentrated). Values above 0.6 indicate high concentration. Uses drep_epoch_snapshot for historical data or drep table for current epoch.

Useful for assessing whether governance power is healthy distributed or dangerously concentrated.

Note: All monetary/power values (voting_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          type: "number",
          description: "Specific epoch for historical snapshot (omit for current)",
        },
        top_n: {
          type: "number",
          description: "Number of top DReps to show (default: 20)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { epoch, top_n = 20 } = args as { epoch?: number; top_n?: number };

    try {
      let allPowersResult;

      if (epoch !== undefined) {
        allPowersResult = await query(
          `SELECT drep_id, voting_power
           FROM drep_epoch_snapshot
           WHERE epoch_no = $1 AND voting_power > 0
           ORDER BY voting_power DESC`,
          [epoch]
        );
      } else {
        allPowersResult = await query(
          `SELECT drep_id, voting_power
           FROM drep
           WHERE active = true AND voting_power > 0
           ORDER BY voting_power DESC`
        );
      }

      if (allPowersResult.rows.length === 0) {
        return createTextResult("No active DReps found for the specified period");
      }

      const powers = allPowersResult.rows.map((r) => Number(r.voting_power));
      const totalPower = powers.reduce((sum, p) => sum + p, 0);
      const gini = computeGini(powers);

      const topDreps = allPowersResult.rows.slice(0, top_n);
      let cumulativeShare = 0;

      const topDrepDetails = topDreps.map((r) => {
        const share = (Number(r.voting_power) / totalPower) * 100;
        cumulativeShare += share;
        return {
          drep_id: r.drep_id,
          voting_power: r.voting_power?.toString(),
          share_pct: parseFloat(share.toFixed(2)),
          cumulative_share_pct: parseFloat(cumulativeShare.toFixed(2)),
        };
      });

      return createJsonResult({
        epoch: epoch || "current",
        total_active_dreps: allPowersResult.rows.length,
        total_voting_power: totalPower.toString(),
        gini_coefficient: parseFloat(gini.toFixed(4)),
        gini_interpretation:
          gini < 0.4 ? "Low concentration" :
          gini < 0.6 ? "Moderate concentration" :
          gini < 0.8 ? "High concentration" : "Very high concentration",
        top_dreps: topDrepDetails,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing DRep concentration: ${errorMessage}`, true);
    }
  },
};

export const getSpoEntityConcentration: ToolHandler = {
  definition: {
    name: "get_spo_entity_concentration",
    description: `Compute SPO entity concentration using Herfindahl-Hirschman Index (HHI).

HHI = sum of squared market shares. Ranges from near 0 (fragmented) to 10000 (monopoly).
- HHI < 1500: Competitive market
- HHI 1500-2500: Moderately concentrated
- HHI > 2500: Highly concentrated

Groups pools by pool_group entity to identify multi-pool operators.

Note: All monetary/power values (voting_power) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  handler: async () => {
    try {
      const result = await query(`
        SELECT
          COALESCE(pg.pool_group, s.pool_name, s.pool_id) as entity_name,
          COUNT(*) as pool_count,
          SUM(s.voting_power) as total_voting_power
        FROM spo s
        LEFT JOIN pool_group pg ON s.pool_id = pg.pool_id
        WHERE s.voting_power > 0
        GROUP BY COALESCE(pg.pool_group, s.pool_name, s.pool_id)
        ORDER BY total_voting_power DESC
      `);

      if (result.rows.length === 0) {
        return createTextResult("No SPO data found");
      }

      const totalPower = result.rows.reduce((sum, r) => sum + Number(r.total_voting_power), 0);

      let hhi = 0;
      const entities = result.rows.map((r) => {
        const share = (Number(r.total_voting_power) / totalPower) * 100;
        hhi += share * share;
        return {
          entity: r.entity_name,
          pool_count: parseInt(r.pool_count),
          voting_power: r.total_voting_power?.toString(),
          market_share_pct: parseFloat(share.toFixed(4)),
        };
      });

      return createJsonResult({
        total_entities: result.rows.length,
        total_voting_power: totalPower.toString(),
        hhi: parseFloat(hhi.toFixed(2)),
        hhi_interpretation:
          hhi < 1500 ? "Competitive (low concentration)" :
          hhi < 2500 ? "Moderately concentrated" : "Highly concentrated",
        top_entities: entities.slice(0, 20),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing SPO entity concentration: ${errorMessage}`, true);
    }
  },
};

export const getVoteDivergence: ToolHandler = {
  definition: {
    name: "get_vote_divergence",
    description: `Compare SPO vs DRep voting patterns per proposal.

Divergence = sum(|drep_pct - spo_pct|) / 2 across yes/no/abstain buckets.
Ranges from 0 (identical) to 100 (completely opposite).

High divergence indicates that SPOs and DReps have fundamentally different views on a proposal, which may signal community tension or different stakeholder priorities.`,
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: {
          type: "string",
          description: "Optional: get divergence for a specific proposal",
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        proposal_id, title, governance_action_type, status,
        drep_active_yes_vote_power, drep_active_no_vote_power, drep_active_abstain_vote_power,
        spo_active_yes_vote_power, spo_active_no_vote_power, spo_active_abstain_vote_power
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
        const drepYes = Number(r.drep_active_yes_vote_power) || 0;
        const drepNo = Number(r.drep_active_no_vote_power) || 0;
        const drepAbstain = Number(r.drep_active_abstain_vote_power) || 0;
        const drepTotal = drepYes + drepNo + drepAbstain;

        const spoYes = Number(r.spo_active_yes_vote_power) || 0;
        const spoNo = Number(r.spo_active_no_vote_power) || 0;
        const spoAbstain = Number(r.spo_active_abstain_vote_power) || 0;
        const spoTotal = spoYes + spoNo + spoAbstain;

        let divergence: number | null = null;
        let drepPcts = { yes: 0, no: 0, abstain: 0 };
        let spoPcts = { yes: 0, no: 0, abstain: 0 };

        if (drepTotal > 0 && spoTotal > 0) {
          drepPcts = {
            yes: (drepYes / drepTotal) * 100,
            no: (drepNo / drepTotal) * 100,
            abstain: (drepAbstain / drepTotal) * 100,
          };
          spoPcts = {
            yes: (spoYes / spoTotal) * 100,
            no: (spoNo / spoTotal) * 100,
            abstain: (spoAbstain / spoTotal) * 100,
          };
          divergence =
            (Math.abs(drepPcts.yes - spoPcts.yes) +
              Math.abs(drepPcts.no - spoPcts.no) +
              Math.abs(drepPcts.abstain - spoPcts.abstain)) / 2;
        }

        return {
          proposal_id: r.proposal_id,
          title: r.title,
          governance_action_type: r.governance_action_type,
          status: r.status,
          divergence_score: divergence !== null ? parseFloat(divergence.toFixed(2)) : null,
          drep_pcts: {
            yes: parseFloat(drepPcts.yes.toFixed(2)),
            no: parseFloat(drepPcts.no.toFixed(2)),
            abstain: parseFloat(drepPcts.abstain.toFixed(2)),
          },
          spo_pcts: {
            yes: parseFloat(spoPcts.yes.toFixed(2)),
            no: parseFloat(spoPcts.no.toFixed(2)),
            abstain: parseFloat(spoPcts.abstain.toFixed(2)),
          },
        };
      });

      return createJsonResult({
        total_results: proposals.length,
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing vote divergence: ${errorMessage}`, true);
    }
  },
};
