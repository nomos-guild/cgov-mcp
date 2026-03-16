import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getTimeToEnactment: ToolHandler = {
  definition: {
    name: "get_time_to_enactment",
    description: `Compute governance action lifecycle timing: epochs from submission to ratification to enactment.

Converts epoch durations to wall-clock time using epoch_totals.start_time.
Useful for understanding how quickly the governance system processes proposals and whether certain types take longer.`,
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
        limit: {
          type: "number",
          description: "Maximum results (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { governance_action_type, status, limit = 20 } = args as {
      governance_action_type?: string;
      status?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [
      `(p.ratified_epoch IS NOT NULL OR p.enacted_epoch IS NOT NULL OR p.expired_epoch IS NOT NULL)`,
    ];

    if (governance_action_type) {
      conditions.push(`p.governance_action_type = $${paramIndex}`);
      params.push(governance_action_type);
      paramIndex++;
    }
    if (status) {
      conditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const sql = `
      SELECT
        p.proposal_id, p.title, p.governance_action_type, p.status,
        p.submission_epoch, p.ratified_epoch, p.enacted_epoch, p.expired_epoch,
        e_sub.start_time as submission_time,
        e_rat.start_time as ratification_time,
        e_enact.start_time as enactment_time,
        e_exp.start_time as expiration_time
      FROM proposal p
      LEFT JOIN epoch_totals e_sub ON p.submission_epoch = e_sub.epoch_no
      LEFT JOIN epoch_totals e_rat ON p.ratified_epoch = e_rat.epoch_no
      LEFT JOIN epoch_totals e_enact ON p.enacted_epoch = e_enact.epoch_no
      LEFT JOIN epoch_totals e_exp ON p.expired_epoch = e_exp.epoch_no
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.created_at DESC NULLS LAST
      LIMIT $${paramIndex}
    `;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No proposals with lifecycle data found");
      }

      const proposals = result.rows.map((r) => {
        const submissionEpoch = r.submission_epoch;
        const ratifiedEpoch = r.ratified_epoch;
        const enactedEpoch = r.enacted_epoch;
        const expiredEpoch = r.expired_epoch;

        const epochsToRatification = ratifiedEpoch && submissionEpoch ? ratifiedEpoch - submissionEpoch : null;
        const epochsToEnactment = enactedEpoch && submissionEpoch ? enactedEpoch - submissionEpoch : null;
        const epochsToExpiration = expiredEpoch && submissionEpoch ? expiredEpoch - submissionEpoch : null;

        let daysToRatification: number | null = null;
        if (r.ratification_time && r.submission_time) {
          daysToRatification = parseFloat(
            ((new Date(r.ratification_time).getTime() - new Date(r.submission_time).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
          );
        }

        let daysToEnactment: number | null = null;
        if (r.enactment_time && r.submission_time) {
          daysToEnactment = parseFloat(
            ((new Date(r.enactment_time).getTime() - new Date(r.submission_time).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
          );
        }

        return {
          proposal_id: r.proposal_id,
          title: r.title,
          governance_action_type: r.governance_action_type,
          status: r.status,
          epochs: {
            submission: submissionEpoch,
            ratified: ratifiedEpoch,
            enacted: enactedEpoch,
            expired: expiredEpoch,
          },
          duration_epochs: {
            to_ratification: epochsToRatification,
            to_enactment: epochsToEnactment,
            to_expiration: epochsToExpiration,
          },
          duration_days: {
            to_ratification: daysToRatification,
            to_enactment: daysToEnactment,
          },
        };
      });

      // Compute averages
      const ratificationEpochs = proposals
        .map((p) => p.duration_epochs.to_ratification)
        .filter((v): v is number => v !== null);
      const enactmentEpochs = proposals
        .map((p) => p.duration_epochs.to_enactment)
        .filter((v): v is number => v !== null);

      return createJsonResult({
        total_results: proposals.length,
        averages: {
          avg_epochs_to_ratification: ratificationEpochs.length > 0
            ? parseFloat((ratificationEpochs.reduce((a, b) => a + b, 0) / ratificationEpochs.length).toFixed(1))
            : null,
          avg_epochs_to_enactment: enactmentEpochs.length > 0
            ? parseFloat((enactmentEpochs.reduce((a, b) => a + b, 0) / enactmentEpochs.length).toFixed(1))
            : null,
        },
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing time to enactment: ${errorMessage}`, true);
    }
  },
};

export const getContentionRate: ToolHandler = {
  definition: {
    name: "get_contention_rate",
    description: `Compute contention scores for proposals based on vote splits.

Contention score = 100 - |yes_pct - no_pct| (higher = more contentious).
A score near 100 means the vote was nearly evenly split between yes and no.
The "contentious" threshold is a yes/no difference of less than 20% (contention > 80).

Useful for identifying controversial proposals and understanding governance consensus patterns.`,
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
        min_contention: {
          type: "number",
          description: "Minimum contention score to include (default: 0, max: 100)",
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
    const { governance_action_type, min_contention = 0, limit = 20 } = args as {
      governance_action_type?: string;
      min_contention?: number;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

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
    `;

    try {
      const result = await query(sql, params);

      const scored = result.rows
        .map((r) => {
          const drepYes = Number(r.drep_active_yes_vote_power) || 0;
          const drepNo = Number(r.drep_active_no_vote_power) || 0;
          const drepAbstain = Number(r.drep_active_abstain_vote_power) || 0;
          const drepTotal = drepYes + drepNo + drepAbstain;

          if (drepTotal === 0) return null;

          const yesPct = (drepYes / drepTotal) * 100;
          const noPct = (drepNo / drepTotal) * 100;
          const abstainPct = (drepAbstain / drepTotal) * 100;
          const contention = 100 - Math.abs(yesPct - noPct);

          if (contention < min_contention) return null;

          return {
            proposal_id: r.proposal_id,
            title: r.title,
            governance_action_type: r.governance_action_type,
            status: r.status,
            contention_score: parseFloat(contention.toFixed(2)),
            is_contentious: contention > 80,
            drep_vote_split: {
              yes_pct: parseFloat(yesPct.toFixed(2)),
              no_pct: parseFloat(noPct.toFixed(2)),
              abstain_pct: parseFloat(abstainPct.toFixed(2)),
            },
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .sort((a, b) => b.contention_score - a.contention_score)
        .slice(0, maxLimit);

      return createJsonResult({
        total_results: scored.length,
        contentious_count: scored.filter((s) => s.is_contentious).length,
        proposals: scored,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error computing contention rate: ${errorMessage}`, true);
    }
  },
};

export const getGovernanceVolume: ToolHandler = {
  definition: {
    name: "get_governance_volume",
    description: `Get governance action volume by type and epoch.

Shows how many proposals of each type were submitted per epoch. Useful for tracking governance activity levels and identifying trends in proposal submission patterns.`,
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
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { from_epoch, to_epoch } = args as {
      from_epoch?: number;
      to_epoch?: number;
    };

    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (from_epoch !== undefined) {
      conditions.push(`submission_epoch >= $${paramIndex}`);
      params.push(from_epoch);
      paramIndex++;
    }
    if (to_epoch !== undefined) {
      conditions.push(`submission_epoch <= $${paramIndex}`);
      params.push(to_epoch);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        submission_epoch,
        governance_action_type,
        COUNT(*) as count
      FROM proposal
      ${whereClause}
      GROUP BY submission_epoch, governance_action_type
      ORDER BY submission_epoch DESC, count DESC
    `;

    try {
      const result = await query(sql, params);

      // Also get totals by type
      const totalsSql = `
        SELECT governance_action_type, COUNT(*) as count
        FROM proposal
        ${whereClause}
        GROUP BY governance_action_type
        ORDER BY count DESC
      `;
      const totalsResult = await query(totalsSql, params);

      // Group by epoch
      const byEpoch: Record<number, Record<string, number>> = {};
      for (const row of result.rows) {
        const epoch = row.submission_epoch;
        if (!byEpoch[epoch]) byEpoch[epoch] = {};
        byEpoch[epoch][row.governance_action_type] = parseInt(row.count);
      }

      return createJsonResult({
        totals_by_type: totalsResult.rows.map((r) => ({
          governance_action_type: r.governance_action_type,
          count: parseInt(r.count),
        })),
        by_epoch: Object.entries(byEpoch)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([epoch, types]) => ({
            epoch: Number(epoch),
            total: Object.values(types).reduce((a, b) => a + b, 0),
            by_type: types,
          })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting governance volume: ${errorMessage}`, true);
    }
  },
};
