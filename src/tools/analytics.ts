import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getEpochTotals: ToolHandler = {
  definition: {
    name: "get_epoch_totals",
    description: `Get epoch-level analytics data including circulation, treasury, rewards, supply, reserves, and governance delegation metrics.

Data includes:
- Circulation, treasury, reward, supply, reserves
- Delegated DRep power and total pool vote power
- Special DRep metrics (always-abstain, always-no-confidence delegator counts and power)
- Epoch timestamps (start, end, first/last block)
- Block and transaction counts

Note: All monetary/power values (voting_power, circulation, treasury, stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          type: "number",
          description: "Specific epoch number to retrieve (if omitted, returns latest epochs)",
        },
        from_epoch: {
          type: "number",
          description: "Start of epoch range (inclusive)",
        },
        to_epoch: {
          type: "number",
          description: "End of epoch range (inclusive)",
        },
        limit: {
          type: "number",
          description: "Number of epochs to return if no specific epoch/range (default: 10)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { epoch, from_epoch, to_epoch, limit = 10 } = args as {
      epoch?: number;
      from_epoch?: number;
      to_epoch?: number;
      limit?: number;
    };

    try {
      let sql: string;
      let params: unknown[];

      if (epoch !== undefined) {
        sql = `SELECT * FROM epoch_totals WHERE epoch_no = $1`;
        params = [epoch];
      } else if (from_epoch !== undefined && to_epoch !== undefined) {
        sql = `SELECT * FROM epoch_totals WHERE epoch_no >= $1 AND epoch_no <= $2 ORDER BY epoch_no DESC`;
        params = [from_epoch, to_epoch];
      } else {
        sql = `SELECT * FROM epoch_totals ORDER BY epoch_no DESC LIMIT $1`;
        params = [Math.min(limit, 50)];
      }

      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No epoch data found for the specified range");
      }

      return createJsonResult({
        epochs: result.rows.map((e) => ({
          epoch: e.epoch_no,
          circulation: e.circulation?.toString(),
          treasury: e.treasury?.toString(),
          reward: e.reward?.toString(),
          supply: e.supply?.toString(),
          reserves: e.reserves?.toString(),
          delegated_drep_power: e.delegated_drep_power?.toString(),
          total_pool_vote_power: e.total_pool_vote_power?.toString(),
          special_dreps: {
            always_no_confidence: {
              delegator_count: e.drep_always_no_confidence_delegator_count,
              voting_power: e.drep_always_no_confidence_voting_power?.toString(),
            },
            always_abstain: {
              delegator_count: e.drep_always_abstain_delegator_count,
              voting_power: e.drep_always_abstain_voting_power?.toString(),
            },
          },
          timestamps: {
            start_time: e.start_time,
            end_time: e.end_time,
            first_block_time: e.first_block_time,
            last_block_time: e.last_block_time,
          },
          block_count: e.block_count,
          tx_count: e.tx_count,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting epoch totals: ${errorMessage}`, true);
    }
  },
};

export const getNCL: ToolHandler = {
  definition: {
    name: "get_ncl",
    description: `Get Net Change Limit (NCL) data for treasury withdrawals. Shows the current and limit amounts per year.

The NCL tracks how much ADA can be withdrawn from the treasury in each budget year.

Note: All monetary values (current_withdrawals, limit) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        year: {
          type: "number",
          description: "Specific year to retrieve (if omitted, returns all years)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { year } = args as { year?: number };

    try {
      let sql: string;
      let params: unknown[];

      if (year) {
        sql = `SELECT * FROM ncl WHERE year = $1`;
        params = [year];
      } else {
        sql = `SELECT * FROM ncl ORDER BY year ASC`;
        params = [];
      }

      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No NCL data found");
      }

      return createJsonResult({
        ncl_data: result.rows.map((r) => ({
          year: r.year,
          epoch: r.epoch,
          current_withdrawals: r.current?.toString(),
          limit: r.limit?.toString(),
          utilization: r.limit
            ? `${((Number(r.current) / Number(r.limit)) * 100).toFixed(1)}%`
            : "N/A",
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting NCL data: ${errorMessage}`, true);
    }
  },
};

export const getDelegationStats: ToolHandler = {
  definition: {
    name: "get_delegation_stats",
    description: `Get delegation statistics including total delegated stake, delegation distribution across DReps, and recent delegation changes.

Useful for understanding the current state of DRep delegation in Cardano governance.

Note: All monetary/power values (voting_power, total_delegated, stake amounts) are in lovelace. Divide by 1,000,000 to display in ADA.`,
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "Optional: get delegation details for a specific DRep",
        },
        include_recent_changes: {
          type: "boolean",
          description: "Include recent delegation changes (default: true)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { drep_id, include_recent_changes = true } = args as {
      drep_id?: string;
      include_recent_changes?: boolean;
    };

    try {
      if (drep_id) {
        // Delegation details for a specific DRep
        const delegationResult = await query(
          `SELECT
            COUNT(*) as delegator_count,
            SUM(amount) as total_delegated
          FROM stake_delegation_state
          WHERE drep_id = $1`,
          [drep_id]
        );

        const result: Record<string, unknown> = {
          drep_id,
          delegator_count: parseInt(delegationResult.rows[0]?.delegator_count || "0"),
          total_delegated: delegationResult.rows[0]?.total_delegated?.toString() || "0",
        };

        if (include_recent_changes) {
          const changes = await query(
            `SELECT
              stake_address,
              from_drep_id,
              to_drep_id,
              delegated_epoch_no,
              observed_at
            FROM stake_delegation_change
            WHERE to_drep_id = $1 OR from_drep_id = $1
            ORDER BY observed_at DESC
            LIMIT 20`,
            [drep_id]
          );

          result.recent_changes = changes.rows.map((c) => ({
            stake_address: c.stake_address,
            direction: c.to_drep_id === drep_id ? "incoming" : "outgoing",
            other_drep: c.to_drep_id === drep_id ? c.from_drep_id : c.to_drep_id,
            epoch: c.delegated_epoch_no,
            observed_at: c.observed_at,
          }));
        }

        return createJsonResult(result);
      }

      // Overall delegation stats
      const overallResult = await query(`
        SELECT
          COUNT(DISTINCT stake_address) as total_delegators,
          COUNT(DISTINCT drep_id) as unique_dreps_delegated_to,
          SUM(amount) as total_delegated_amount
        FROM stake_delegation_state
        WHERE drep_id IS NOT NULL
      `);

      const topDrepsResult = await query(`
        SELECT
          s.drep_id,
          d.name as drep_name,
          COUNT(*) as delegator_count,
          SUM(s.amount) as total_delegated
        FROM stake_delegation_state s
        LEFT JOIN drep d ON s.drep_id = d.drep_id
        WHERE s.drep_id IS NOT NULL
        GROUP BY s.drep_id, d.name
        ORDER BY total_delegated DESC NULLS LAST
        LIMIT 10
      `);

      const result: Record<string, unknown> = {
        overall: {
          total_delegators: parseInt(overallResult.rows[0]?.total_delegators || "0"),
          unique_dreps: parseInt(overallResult.rows[0]?.unique_dreps_delegated_to || "0"),
          total_delegated: overallResult.rows[0]?.total_delegated_amount?.toString() || "0",
        },
        top_dreps_by_delegation: topDrepsResult.rows.map((r) => ({
          drep_id: r.drep_id,
          name: r.drep_name,
          delegator_count: parseInt(r.delegator_count),
          total_delegated: r.total_delegated?.toString(),
        })),
      };

      if (include_recent_changes) {
        const recentChanges = await query(`
          SELECT
            sc.stake_address,
            sc.from_drep_id,
            sc.to_drep_id,
            sc.delegated_epoch_no,
            sc.observed_at,
            d1.name as from_drep_name,
            d2.name as to_drep_name
          FROM stake_delegation_change sc
          LEFT JOIN drep d1 ON sc.from_drep_id = d1.drep_id
          LEFT JOIN drep d2 ON sc.to_drep_id = d2.drep_id
          ORDER BY sc.observed_at DESC
          LIMIT 20
        `);

        result.recent_changes = recentChanges.rows.map((c) => ({
          stake_address: c.stake_address,
          from_drep: c.from_drep_name || c.from_drep_id || "(none)",
          to_drep: c.to_drep_name || c.to_drep_id || "(none)",
          epoch: c.delegated_epoch_no,
          observed_at: c.observed_at,
        }));
      }

      return createJsonResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting delegation stats: ${errorMessage}`, true);
    }
  },
};

export const getDevActivity: ToolHandler = {
  definition: {
    name: "get_dev_activity",
    description: `Get GitHub development activity metrics for Cardano ecosystem repositories.

Returns:
- Repository activity (commits, PRs, issues)
- Developer metrics (active contributors, new developers)
- Historical trends

Useful for tracking the Vision 2030 KPI on developer ecosystem growth.`,
    inputSchema: {
      type: "object",
      properties: {
        repo_query: {
          type: "string",
          description: "Optional: filter by repository name or owner (e.g., 'IntersectMBO', 'cardano')",
        },
        date_from: {
          type: "string",
          description: "Start date for activity range (ISO format, e.g., '2025-01-01')",
        },
        date_to: {
          type: "string",
          description: "End date for activity range (ISO format)",
        },
        metric: {
          type: "string",
          enum: ["repos", "developers", "activity"],
          description: "Type of metrics to return (default: 'activity')",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const {
      repo_query,
      date_from,
      date_to,
      metric = "activity",
      limit = 20,
    } = args as {
      repo_query?: string;
      date_from?: string;
      date_to?: string;
      metric?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 50);

    try {
      if (metric === "repos") {
        let sql = `
          SELECT
            id, owner, name, description, language, stars, forks,
            is_fork, is_archived, is_active, sync_tier,
            last_activity_at, repo_created_at
          FROM github_repository
        `;
        const params: unknown[] = [];

        if (repo_query) {
          sql += ` WHERE id ILIKE $1 OR owner ILIKE $1 OR name ILIKE $1 OR description ILIKE $1`;
          params.push(`%${repo_query}%`);
        }

        sql += ` ORDER BY stars DESC LIMIT $${params.length + 1}`;
        params.push(maxLimit);

        const result = await query(sql, params);

        return createJsonResult({
          total_results: result.rows.length,
          repositories: result.rows.map((r) => ({
            id: r.id,
            owner: r.owner,
            name: r.name,
            description: r.description,
            language: r.language,
            stars: r.stars,
            forks: r.forks,
            is_active: r.is_active,
            sync_tier: r.sync_tier,
            last_activity_at: r.last_activity_at,
          })),
        });
      }

      if (metric === "developers") {
        let sql = `
          SELECT
            id as login,
            avatar_url,
            total_commits,
            total_prs,
            repo_count,
            org_count,
            is_active,
            first_seen_at,
            last_seen_at
          FROM github_developer
        `;
        const params: unknown[] = [];

        if (repo_query) {
          sql = `
            SELECT
              gd.id as login,
              gd.avatar_url,
              gd.total_commits,
              gd.total_prs,
              gd.repo_count,
              gd.org_count,
              gd.is_active,
              gd.first_seen_at,
              gd.last_seen_at
            FROM github_developer gd
            JOIN developer_repo_activity dra ON gd.id = dra.developer_login
            WHERE dra.repo_id ILIKE $1
          `;
          params.push(`%${repo_query}%`);
        }

        sql += ` ORDER BY total_commits DESC LIMIT $${params.length + 1}`;
        params.push(maxLimit);

        const result = await query(sql, params);

        // Overall developer stats
        const statsResult = await query(`
          SELECT
            COUNT(*) as total_developers,
            COUNT(*) FILTER (WHERE is_active = true) as active_developers,
            SUM(total_commits) as total_commits,
            SUM(total_prs) as total_prs
          FROM github_developer
        `);

        return createJsonResult({
          overall: {
            total_developers: parseInt(statsResult.rows[0]?.total_developers || "0"),
            active_developers: parseInt(statsResult.rows[0]?.active_developers || "0"),
            total_commits: parseInt(statsResult.rows[0]?.total_commits || "0"),
            total_prs: parseInt(statsResult.rows[0]?.total_prs || "0"),
          },
          top_developers: result.rows.map((d) => ({
            login: d.login,
            total_commits: d.total_commits,
            total_prs: d.total_prs,
            repo_count: d.repo_count,
            is_active: d.is_active,
            first_seen_at: d.first_seen_at,
            last_seen_at: d.last_seen_at,
          })),
        });
      }

      // Default: activity metrics
      const params: unknown[] = [];
      let dateFilter = "";

      if (date_from && date_to) {
        dateFilter = `WHERE date >= $1 AND date <= $2`;
        params.push(date_from, date_to);
      } else if (date_from) {
        dateFilter = `WHERE date >= $1`;
        params.push(date_from);
      } else if (date_to) {
        dateFilter = `WHERE date <= $1`;
        params.push(date_to);
      }

      let repoFilter = "";
      if (repo_query) {
        const connector = dateFilter ? "AND" : "WHERE";
        repoFilter = ` ${connector} repo_id ILIKE $${params.length + 1}`;
        params.push(`%${repo_query}%`);
      }

      const activityResult = await query(
        `SELECT
          date,
          SUM(commit_count) as total_commits,
          SUM(pr_opened) as total_pr_opened,
          SUM(pr_merged) as total_pr_merged,
          SUM(issues_opened) as total_issues_opened,
          SUM(issues_closed) as total_issues_closed,
          SUM(additions) as total_additions,
          SUM(deletions) as total_deletions,
          SUM(unique_contributors) as total_contributors
        FROM activity_historical
        ${dateFilter}${repoFilter}
        GROUP BY date
        ORDER BY date DESC
        LIMIT $${params.length + 1}`,
        [...params, maxLimit]
      );

      return createJsonResult({
        activity: activityResult.rows.map((a) => ({
          date: a.date,
          commits: parseInt(a.total_commits || "0"),
          pr_opened: parseInt(a.total_pr_opened || "0"),
          pr_merged: parseInt(a.total_pr_merged || "0"),
          issues_opened: parseInt(a.total_issues_opened || "0"),
          issues_closed: parseInt(a.total_issues_closed || "0"),
          additions: parseInt(a.total_additions || "0"),
          deletions: parseInt(a.total_deletions || "0"),
          contributors: parseInt(a.total_contributors || "0"),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting dev activity: ${errorMessage}`, true);
    }
  },
};
