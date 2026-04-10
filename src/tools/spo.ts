import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const searchSPOs: ToolHandler = {
  definition: {
    name: "search_spos",
    description: `Search for Stake Pool Operators (SPOs) by pool name, ticker, or pool ID.

Returns SPO profiles with voting power and pool metadata.

Note: All monetary/power values (voting_power, stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - pool name, ticker, or pool ID prefix",
        },
        sort_by: {
          type: "string",
          enum: ["voting_power", "pool_name"],
          description: "Sort results by field (default: voting_power)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20, max: 100)",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const {
      query: searchQuery,
      sort_by = "voting_power",
      limit = 20,
    } = args as {
      query: string;
      sort_by?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const sortColumn = sort_by === "pool_name" ? "pool_name" : "voting_power";

    const sql = `
      SELECT
        s.pool_id,
        s.pool_name,
        s.ticker,
        s.icon_url,
        s.voting_power,
        pg.pool_group,
        pg.adastat_group,
        pg.balanceanalytics_group,
        s.created_at
      FROM spo s
      LEFT JOIN pool_group pg ON s.pool_id = pg.pool_id
      WHERE (
        s.pool_name ILIKE $1
        OR s.ticker ILIKE $1
        OR s.pool_id ILIKE $1
      )
      ORDER BY ${sortColumn} DESC NULLS LAST
      LIMIT $2
    `;

    try {
      const result = await query(sql, [`%${searchQuery}%`, maxLimit]);

      if (result.rows.length === 0) {
        return createTextResult(`No SPOs found matching "${searchQuery}"`);
      }

      return createJsonResult({
        total_results: result.rows.length,
        spos: result.rows.map((r) => ({
          pool_id: r.pool_id,
          pool_name: r.pool_name,
          ticker: r.ticker,
          icon_url: r.icon_url,
          voting_power: r.voting_power?.toString(),
          pool_group: r.pool_group,
          adastat_group: r.adastat_group,
          balanceanalytics_group: r.balanceanalytics_group,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching SPOs: ${errorMessage}`, true);
    }
  },
};

export const getTopSPOs: ToolHandler = {
  definition: {
    name: "get_top_spos",
    description: `Get the top SPOs ranked by voting power. Includes pool group information for identifying multi-pool operators.

Note: All monetary/power values (voting_power, stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of SPOs to return (default: 20, max: 100)",
        },
        include_groups: {
          type: "boolean",
          description: "Include pool group/entity information (default: true)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { limit = 20, include_groups = true } = args as {
      limit?: number;
      include_groups?: boolean;
    };

    const maxLimit = Math.min(limit, 100);

    try {
      const sql = include_groups
        ? `SELECT
            s.pool_id,
            s.pool_name,
            s.ticker,
            s.voting_power,
            pg.pool_group,
            pg.adastat_group,
            pg.balanceanalytics_group
          FROM spo s
          LEFT JOIN pool_group pg ON s.pool_id = pg.pool_id
          ORDER BY s.voting_power DESC NULLS LAST
          LIMIT $1`
        : `SELECT pool_id, pool_name, ticker, voting_power
           FROM spo
           ORDER BY voting_power DESC NULLS LAST
           LIMIT $1`;

      const result = await query(sql, [maxLimit]);

      const totalPowerResult = await query(
        `SELECT SUM(voting_power) as total FROM spo`
      );
      const totalPower = BigInt(totalPowerResult.rows[0]?.total || 0);

      let cumulativePower = BigInt(0);
      const spos = result.rows.map((r, i) => {
        const power = BigInt(r.voting_power || 0);
        cumulativePower += power;
        return {
          rank: i + 1,
          pool_id: r.pool_id,
          pool_name: r.pool_name,
          ticker: r.ticker,
          voting_power: r.voting_power?.toString(),
          voting_power_pct: totalPower > 0
            ? `${((Number(power) / Number(totalPower)) * 100).toFixed(2)}%`
            : "N/A",
          cumulative_power_pct: totalPower > 0
            ? `${((Number(cumulativePower) / Number(totalPower)) * 100).toFixed(2)}%`
            : "N/A",
          ...(include_groups && {
            pool_group: r.pool_group,
            adastat_group: r.adastat_group,
          }),
        };
      });

      return createJsonResult({
        total_spo_voting_power: totalPower.toString(),
        spos,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting top SPOs: ${errorMessage}`, true);
    }
  },
};

export const getSPOVotingHistory: ToolHandler = {
  definition: {
    name: "get_spo_voting_history",
    description: `Get the voting history for a specific SPO (Stake Pool Operator).

Returns all votes cast by the SPO including vote choice, proposal details, and voting power.

Note: All monetary/power values (voting_power, stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        pool_id: {
          type: "string",
          description: "The pool ID (bech32 format)",
        },
        vote_filter: {
          type: "string",
          enum: ["YES", "NO", "ABSTAIN"],
          description: "Optional: filter by vote type",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20, max: 100)",
        },
      },
      required: ["pool_id"],
    },
  },
  handler: async (args) => {
    const { pool_id, vote_filter, limit = 20 } = args as {
      pool_id: string;
      vote_filter?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [pool_id];
    let paramIndex = 2;

    let sql = `
      SELECT
        v.id,
        v.vote,
        v.proposal_id,
        v.voting_power,
        v.voted_at,
        v.rationale,
        v.anchor_url,
        p.title as proposal_title,
        p.governance_action_type,
        p.status as proposal_status
      FROM onchain_vote v
      LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
      WHERE v.spo_id = $1
    `;

    if (vote_filter) {
      sql += ` AND v.vote = $${paramIndex}`;
      params.push(vote_filter);
      paramIndex++;
    }

    sql += ` ORDER BY v.voted_at DESC LIMIT $${paramIndex}`;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult(`No voting history found for SPO: ${pool_id}`);
      }

      // Get SPO info
      const spoResult = await query(
        `SELECT pool_name, ticker, voting_power FROM spo WHERE pool_id = $1`,
        [pool_id]
      );
      const spo = spoResult.rows[0];

      const voteCounts = { YES: 0, NO: 0, ABSTAIN: 0 };
      result.rows.forEach((row) => {
        if (row.vote in voteCounts) {
          voteCounts[row.vote as keyof typeof voteCounts]++;
        }
      });

      return createJsonResult({
        spo: {
          pool_id,
          pool_name: spo?.pool_name,
          ticker: spo?.ticker,
          current_voting_power: spo?.voting_power?.toString(),
        },
        vote_summary: {
          total_votes: result.rows.length,
          distribution: voteCounts,
        },
        votes: result.rows.map((r) => ({
          vote_id: r.id,
          vote: r.vote,
          proposal_id: r.proposal_id,
          proposal_title: r.proposal_title,
          governance_action_type: r.governance_action_type,
          proposal_status: r.proposal_status,
          voting_power: r.voting_power?.toString(),
          voted_at: r.voted_at,
          has_rationale: !!r.rationale,
          anchor_url: r.anchor_url,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting SPO voting history: ${errorMessage}`, true);
    }
  },
};
