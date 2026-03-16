import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const getDevHealth: ToolHandler = {
  definition: {
    name: "get_dev_health",
    description: `Get development health metrics: PR merge time, issue resolution time, and releases published.

Aggregates from activity_historical table. Useful for assessing development velocity and project health across Cardano ecosystem repositories.`,
    inputSchema: {
      type: "object",
      properties: {
        repo_query: {
          type: "string",
          description: "Optional: filter by repository name or owner (e.g., 'IntersectMBO', 'cardano-node')",
        },
        date_from: {
          type: "string",
          description: "Start date (ISO format, e.g., '2025-01-01')",
        },
        date_to: {
          type: "string",
          description: "End date (ISO format)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { repo_query, date_from, date_to } = args as {
      repo_query?: string;
      date_from?: string;
      date_to?: string;
    };

    const params: unknown[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (date_from) {
      conditions.push(`date >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      conditions.push(`date <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }
    if (repo_query) {
      conditions.push(`repo_id ILIKE $${paramIndex}`);
      params.push(`%${repo_query}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        AVG(avg_pr_merge_hours) FILTER (WHERE avg_pr_merge_hours IS NOT NULL) as avg_pr_merge_hours,
        AVG(avg_issue_resolution_hours) FILTER (WHERE avg_issue_resolution_hours IS NOT NULL) as avg_issue_resolution_hours,
        SUM(releases_published) as total_releases,
        SUM(commit_count) as total_commits,
        SUM(pr_merged) as total_pr_merged,
        SUM(issues_closed) as total_issues_closed,
        COUNT(DISTINCT repo_id) as repos_active,
        COUNT(DISTINCT date) as days_active
      FROM activity_historical
      ${whereClause}
    `;

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0 || !result.rows[0].days_active) {
        return createTextResult("No development activity data found for the specified criteria");
      }

      const r = result.rows[0];

      // Per-repo breakdown
      const repoSql = `
        SELECT
          repo_id,
          AVG(avg_pr_merge_hours) FILTER (WHERE avg_pr_merge_hours IS NOT NULL) as avg_pr_merge_hours,
          AVG(avg_issue_resolution_hours) FILTER (WHERE avg_issue_resolution_hours IS NOT NULL) as avg_issue_resolution_hours,
          SUM(releases_published) as releases,
          SUM(commit_count) as commits,
          SUM(pr_merged) as prs_merged
        FROM activity_historical
        ${whereClause}
        GROUP BY repo_id
        ORDER BY SUM(commit_count) DESC
        LIMIT 20
      `;
      const repoResult = await query(repoSql, params);

      return createJsonResult({
        overall: {
          avg_pr_merge_hours: r.avg_pr_merge_hours ? parseFloat(Number(r.avg_pr_merge_hours).toFixed(1)) : null,
          avg_issue_resolution_hours: r.avg_issue_resolution_hours ? parseFloat(Number(r.avg_issue_resolution_hours).toFixed(1)) : null,
          total_releases: parseInt(r.total_releases || "0"),
          total_commits: parseInt(r.total_commits || "0"),
          total_prs_merged: parseInt(r.total_pr_merged || "0"),
          total_issues_closed: parseInt(r.total_issues_closed || "0"),
          repos_active: parseInt(r.repos_active || "0"),
          days_active: parseInt(r.days_active || "0"),
        },
        top_repos: repoResult.rows.map((repo) => ({
          repo_id: repo.repo_id,
          avg_pr_merge_hours: repo.avg_pr_merge_hours ? parseFloat(Number(repo.avg_pr_merge_hours).toFixed(1)) : null,
          avg_issue_resolution_hours: repo.avg_issue_resolution_hours ? parseFloat(Number(repo.avg_issue_resolution_hours).toFixed(1)) : null,
          releases: parseInt(repo.releases || "0"),
          commits: parseInt(repo.commits || "0"),
          prs_merged: parseInt(repo.prs_merged || "0"),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting dev health metrics: ${errorMessage}`, true);
    }
  },
};

export const getRepoTrends: ToolHandler = {
  definition: {
    name: "get_repo_trends",
    description: `Get repository trends: star/fork growth over time and language distribution.

Uses repo_daily_snapshot for time-series data and github_repository for language stats. Useful for tracking ecosystem growth and identifying technology trends.`,
    inputSchema: {
      type: "object",
      properties: {
        repo_query: {
          type: "string",
          description: "Optional: filter by repository name or owner",
        },
        metric: {
          type: "string",
          enum: ["stars", "forks", "languages"],
          description: "Which metric to retrieve (default: 'stars')",
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
    const { repo_query, metric = "stars", limit = 20 } = args as {
      repo_query?: string;
      metric?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);

    try {
      if (metric === "languages") {
        const params: unknown[] = [];
        let whereClause = "";

        if (repo_query) {
          whereClause = `WHERE id ILIKE $1 OR owner ILIKE $1 OR name ILIKE $1`;
          params.push(`%${repo_query}%`);
        }

        const sql = `
          SELECT
            language,
            COUNT(*) as repo_count,
            SUM(stars) as total_stars
          FROM github_repository
          ${whereClause}
          ${whereClause ? "AND" : "WHERE"} language IS NOT NULL AND is_active = true
          GROUP BY language
          ORDER BY repo_count DESC
          LIMIT $${params.length + 1}
        `;
        params.push(maxLimit);

        const result = await query(sql, params);

        return createJsonResult({
          languages: result.rows.map((r) => ({
            language: r.language,
            repo_count: parseInt(r.repo_count),
            total_stars: parseInt(r.total_stars || "0"),
          })),
        });
      }

      // Stars or forks trend
      const orderField = metric === "forks" ? "forks" : "stars";
      const params: unknown[] = [];
      let repoFilter = "";

      if (repo_query) {
        repoFilter = `WHERE repo_id ILIKE $1`;
        params.push(`%${repo_query}%`);
      }

      const sql = `
        SELECT
          repo_id,
          snapshot_date,
          stars,
          forks
        FROM repo_daily_snapshot
        ${repoFilter}
        ORDER BY ${orderField} DESC, snapshot_date DESC
        LIMIT $${params.length + 1}
      `;
      params.push(maxLimit);

      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("No repository snapshot data found");
      }

      return createJsonResult({
        metric,
        snapshots: result.rows.map((r) => ({
          repo_id: r.repo_id,
          date: r.snapshot_date,
          stars: r.stars,
          forks: r.forks,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting repo trends: ${errorMessage}`, true);
    }
  },
};
