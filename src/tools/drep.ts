import { query } from "../db/index.js";
import { drepUrl } from "../lib/urls.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const searchDreps: ToolHandler = {
  definition: {
    name: "search_dreps",
    description:
      "Search Delegated Representatives (DReps) by name, ID, or CIP-119 metadata keywords. Returns voting power, delegator count, status, bio, and the canonical `url` to cite.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query - DRep name, ID prefix, or keywords from bio/motivations/objectives",
        },
        active_only: {
          type: "boolean",
          description: "Only return active DReps (default: true)",
        },
        sort_by: {
          type: "string",
          enum: ["voting_power", "delegator_count", "name"],
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
      active_only = true,
      sort_by = "voting_power",
      limit = 20,
    } = args as {
      query: string;
      active_only?: boolean;
      sort_by?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [`%${searchQuery}%`];
    let paramIndex = 2;

    let sql = `
      SELECT
        drep_id,
        name,
        bio,
        motivations,
        objectives,
        qualifications,
        voting_power,
        delegator_count,
        registered,
        active,
        expires_epoch,
        icon_url,
        meta_url,
        payment_addr,
        created_at,
        updated_at
      FROM drep
      WHERE (
        name ILIKE $1
        OR drep_id ILIKE $1
        OR bio ILIKE $1
        OR motivations ILIKE $1
        OR objectives ILIKE $1
        OR qualifications ILIKE $1
      )
    `;

    if (active_only) {
      sql += ` AND active = true`;
    }

    const sortColumn =
      sort_by === "delegator_count"
        ? "delegator_count"
        : sort_by === "name"
          ? "name"
          : "voting_power";
    sql += ` ORDER BY ${sortColumn} DESC NULLS LAST LIMIT $${paramIndex}`;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult(`No DReps found matching "${searchQuery}"`);
      }

      return createJsonResult({
        total_results: result.rows.length,
        query: searchQuery,
        dreps: result.rows.map((r) => ({
          drep_id: r.drep_id,
          url: drepUrl(r.drep_id),
          name: r.name,
          bio: r.bio,
          motivations: r.motivations,
          objectives: r.objectives,
          qualifications: r.qualifications,
          voting_power: r.voting_power?.toString(),
          delegator_count: r.delegator_count,
          registered: r.registered,
          active: r.active,
          expires_epoch: r.expires_epoch,
          icon_url: r.icon_url,
          meta_url: r.meta_url,
          payment_addr: r.payment_addr,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching DReps: ${errorMessage}`, true);
    }
  },
};

export const getDrepProfile: ToolHandler = {
  definition: {
    name: "get_drep_profile",
    description:
      "Get the full profile of a specific DRep by ID. Returns CIP-119 metadata, current voting power/delegators, status, optional epoch-snapshot history, lifecycle events, and the canonical `url`.",
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "The DRep ID (e.g., 'drep1...')",
        },
        include_history: {
          type: "boolean",
          description: "Include historical epoch snapshots (default: false)",
        },
      },
      required: ["drep_id"],
    },
  },
  handler: async (args) => {
    const { drep_id, include_history = false } = args as {
      drep_id: string;
      include_history?: boolean;
    };

    try {
      const drepResult = await query(
        `SELECT * FROM drep WHERE drep_id = $1`,
        [drep_id]
      );

      if (drepResult.rows.length === 0) {
        return createTextResult(`DRep not found: ${drep_id}`, true);
      }

      const d = drepResult.rows[0];

      const profile: Record<string, unknown> = {
        drep_id: d.drep_id,
        url: drepUrl(d.drep_id),
        name: d.name,
        bio: d.bio,
        motivations: d.motivations,
        objectives: d.objectives,
        qualifications: d.qualifications,
        references: d.references,
        voting_power: d.voting_power?.toString(),
        delegator_count: d.delegator_count,
        registered: d.registered,
        active: d.active,
        expires_epoch: d.expires_epoch,
        icon_url: d.icon_url,
        meta_url: d.meta_url,
        meta_hash: d.meta_hash,
        payment_addr: d.payment_addr,
        created_at: d.created_at,
        updated_at: d.updated_at,
      };

      if (include_history) {
        const snapshots = await query(
          `SELECT epoch_no, delegator_count, voting_power, created_at
           FROM drep_epoch_snapshot
           WHERE drep_id = $1
           ORDER BY epoch_no DESC
           LIMIT 20`,
          [drep_id]
        );
        profile.epoch_snapshots = snapshots.rows.map((s) => ({
          epoch: s.epoch_no,
          delegator_count: s.delegator_count,
          voting_power: s.voting_power?.toString(),
        }));
      }

      // Get lifecycle events
      const lifecycle = await query(
        `SELECT action, epoch_no, block_time, tx_hash
         FROM drep_lifecycle_event
         WHERE drep_id = $1
         ORDER BY epoch_no DESC, block_time DESC
         LIMIT 10`,
        [drep_id]
      );
      profile.lifecycle_events = lifecycle.rows;

      return createJsonResult(profile);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting DRep profile: ${errorMessage}`, true);
    }
  },
};

export const getTopDreps: ToolHandler = {
  definition: {
    name: "get_top_dreps",
    description:
      "Get the leaderboard of top DReps ranked by voting power or delegator count, with cumulative power %. Each row includes the canonical `url`.",
    inputSchema: {
      type: "object",
      properties: {
        sort_by: {
          type: "string",
          enum: ["voting_power", "delegator_count"],
          description: "Rank by voting power or delegator count (default: voting_power)",
        },
        active_only: {
          type: "boolean",
          description: "Only return active DReps (default: true)",
        },
        limit: {
          type: "number",
          description: "Number of DReps to return (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const {
      sort_by = "voting_power",
      active_only = true,
      limit = 20,
    } = args as {
      sort_by?: string;
      active_only?: boolean;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const sortColumn = sort_by === "delegator_count" ? "delegator_count" : "voting_power";

    let sql = `
      SELECT
        drep_id,
        name,
        bio,
        voting_power,
        delegator_count,
        registered,
        active,
        expires_epoch
      FROM drep
    `;

    if (active_only) {
      sql += ` WHERE active = true`;
    }

    sql += ` ORDER BY ${sortColumn} DESC NULLS LAST LIMIT $1`;

    try {
      const result = await query(sql, [maxLimit]);

      // Calculate cumulative voting power share
      const totalPowerResult = await query(
        `SELECT SUM(voting_power) as total FROM drep WHERE active = true`
      );
      const totalPower = BigInt(totalPowerResult.rows[0]?.total || 0);

      let cumulativePower = BigInt(0);
      const dreps = result.rows.map((r, i) => {
        const power = BigInt(r.voting_power || 0);
        cumulativePower += power;
        return {
          rank: i + 1,
          drep_id: r.drep_id,
          url: drepUrl(r.drep_id),
          name: r.name,
          bio: r.bio?.substring(0, 200),
          voting_power: r.voting_power?.toString(),
          voting_power_pct: totalPower > 0
            ? `${((Number(power) / Number(totalPower)) * 100).toFixed(2)}%`
            : "N/A",
          cumulative_power_pct: totalPower > 0
            ? `${((Number(cumulativePower) / Number(totalPower)) * 100).toFixed(2)}%`
            : "N/A",
          delegator_count: r.delegator_count,
          active: r.active,
        };
      });

      return createJsonResult({
        total_active_dreps: result.rows.length,
        total_voting_power: totalPower.toString(),
        sorted_by: sortColumn,
        dreps,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting top DReps: ${errorMessage}`, true);
    }
  },
};
