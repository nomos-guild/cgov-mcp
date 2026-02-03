import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

interface RationaleBody {
  summary?: string;
  rationaleStatement?: string;
  precedentDiscussion?: string;
  counterargumentDiscussion?: string;
  conclusion?: string;
  comment?: string;
  internalVote?: {
    constitutional?: number;
    unconstitutional?: number;
    abstain?: number;
    didNotVote?: number;
  };
  references?: Array<{
    "@type"?: string;
    label?: string;
    uri?: string;
  }>;
}

interface RationaleJson {
  body?: RationaleBody;
  authors?: Array<{
    name?: string;
    did?: string;
  }>;
  "@context"?: unknown;
  hashAlgorithm?: string;
}

function parseRationale(rationaleText: string | null): RationaleJson | null {
  if (!rationaleText) return null;
  try {
    return JSON.parse(rationaleText) as RationaleJson;
  } catch {
    return null;
  }
}

function extractRationaleSummary(rationale: RationaleJson | null): string {
  if (!rationale?.body) return "No rationale provided";

  const parts: string[] = [];

  if (rationale.body.summary) {
    parts.push(`**Summary:** ${rationale.body.summary}`);
  }
  if (rationale.body.comment) {
    parts.push(`**Comment:** ${rationale.body.comment}`);
  }
  if (rationale.body.conclusion) {
    parts.push(`**Conclusion:** ${rationale.body.conclusion}`);
  }

  if (rationale.authors && rationale.authors.length > 0) {
    const authorNames = rationale.authors
      .map((a) => a.name || a.did || "Unknown")
      .join(", ");
    parts.push(`**Author(s):** ${authorNames}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "Rationale structure present but no summary/comment/conclusion";
}

export const searchVotingRationale: ToolHandler = {
  definition: {
    name: "search_voting_rationale",
    description: `Search voting rationales across all on-chain votes. Rationales are stored in CIP-100/CIP-136 JSON format containing structured reasoning for votes.

Use this to find:
- Votes with specific reasoning or keywords
- Constitutional arguments and precedents
- DRep/CC/SPO voting patterns with explanations
- References to specific articles or governance actions

The rationale JSON contains: summary, rationaleStatement, conclusion, precedentDiscussion, counterargumentDiscussion, internalVote (for CC), and references.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query - keywords to find in rationale text (e.g., 'constitutional', 'treasury', 'hard fork')",
        },
        vote_filter: {
          type: "string",
          enum: ["YES", "NO", "ABSTAIN"],
          description: "Optional: filter by vote type",
        },
        voter_type: {
          type: "string",
          enum: ["DREP", "SPO", "CC"],
          description: "Optional: filter by voter type (DRep, SPO, or Constitutional Committee)",
        },
        proposal_id: {
          type: "string",
          description: "Optional: filter by specific proposal ID",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const {
      query: searchQuery,
      vote_filter,
      voter_type,
      proposal_id,
      limit = 10,
    } = args as {
      query: string;
      vote_filter?: string;
      voter_type?: string;
      proposal_id?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 50);
    const params: unknown[] = [`%${searchQuery}%`];
    let paramIndex = 2;

    let sql = `
      SELECT
        v.id,
        v.vote,
        v.voter_type,
        v.drep_id,
        v.spo_id,
        v.cc_id,
        v.proposal_id,
        v.rationale,
        v.anchor_url,
        v.voted_at,
        v.voting_power,
        p.title as proposal_title,
        p.governance_action_type,
        d.name as drep_name
      FROM onchain_vote v
      LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
      LEFT JOIN drep d ON v.drep_id = d.drep_id
      WHERE v.rationale ILIKE $1
    `;

    if (vote_filter) {
      sql += ` AND v.vote = $${paramIndex}`;
      params.push(vote_filter);
      paramIndex++;
    }

    if (voter_type) {
      sql += ` AND v.voter_type = $${paramIndex}`;
      params.push(voter_type);
      paramIndex++;
    }

    if (proposal_id) {
      sql += ` AND v.proposal_id = $${paramIndex}`;
      params.push(proposal_id);
      paramIndex++;
    }

    sql += ` ORDER BY v.voted_at DESC LIMIT $${paramIndex}`;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult(
          `No voting rationales found matching "${searchQuery}"${vote_filter ? ` with vote=${vote_filter}` : ""}${voter_type ? ` from ${voter_type}` : ""}`
        );
      }

      const formattedResults = result.rows.map((row) => {
        const rationale = parseRationale(row.rationale);
        return {
          vote_id: row.id,
          vote: row.vote,
          voter_type: row.voter_type,
          voter_id: row.drep_id || row.spo_id || row.cc_id,
          voter_name: row.drep_name || null,
          proposal_id: row.proposal_id,
          proposal_title: row.proposal_title,
          governance_action_type: row.governance_action_type,
          voting_power: row.voting_power?.toString(),
          voted_at: row.voted_at,
          rationale_summary: extractRationaleSummary(rationale),
          anchor_url: row.anchor_url,
        };
      });

      return createJsonResult({
        total_matches: result.rows.length,
        query: searchQuery,
        filters: { vote_filter, voter_type, proposal_id },
        results: formattedResults,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching rationales: ${errorMessage}`, true);
    }
  },
};

export const getVoteRationale: ToolHandler = {
  definition: {
    name: "get_vote_rationale",
    description: `Get the full rationale for a specific vote by vote ID or by voter+proposal combination.

Returns the complete CIP-100/CIP-136 structured rationale including:
- Summary and conclusion
- Full rationale statement
- Precedent and counterargument discussions
- Internal vote breakdown (for CC votes)
- References to relevant articles`,
    inputSchema: {
      type: "object",
      properties: {
        vote_id: {
          type: "string",
          description: "The vote ID to retrieve rationale for",
        },
        drep_id: {
          type: "string",
          description: "DRep ID (use with proposal_id instead of vote_id)",
        },
        proposal_id: {
          type: "string",
          description: "Proposal ID (use with drep_id/spo_id/cc_id instead of vote_id)",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { vote_id, drep_id, proposal_id } = args as {
      vote_id?: string;
      drep_id?: string;
      proposal_id?: string;
    };

    if (!vote_id && !(drep_id && proposal_id)) {
      return createTextResult(
        "Please provide either vote_id OR (drep_id + proposal_id) to retrieve a rationale",
        true
      );
    }

    let sql: string;
    let params: unknown[];

    if (vote_id) {
      sql = `
        SELECT
          v.*,
          p.title as proposal_title,
          p.governance_action_type,
          p.description as proposal_description,
          d.name as drep_name
        FROM onchain_vote v
        LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
        LEFT JOIN drep d ON v.drep_id = d.drep_id
        WHERE v.id = $1
      `;
      params = [vote_id];
    } else {
      sql = `
        SELECT
          v.*,
          p.title as proposal_title,
          p.governance_action_type,
          p.description as proposal_description,
          d.name as drep_name
        FROM onchain_vote v
        LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
        LEFT JOIN drep d ON v.drep_id = d.drep_id
        WHERE v.drep_id = $1 AND v.proposal_id = $2
      `;
      params = [drep_id, proposal_id];
    }

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult("Vote not found", true);
      }

      const row = result.rows[0];
      const rationale = parseRationale(row.rationale);

      const response = {
        vote: {
          id: row.id,
          vote: row.vote,
          voter_type: row.voter_type,
          voter_id: row.drep_id || row.spo_id || row.cc_id,
          voter_name: row.drep_name,
          voting_power: row.voting_power?.toString(),
          voted_at: row.voted_at,
          tx_hash: row.tx_hash,
        },
        proposal: {
          id: row.proposal_id,
          title: row.proposal_title,
          governance_action_type: row.governance_action_type,
          description: row.proposal_description,
        },
        rationale: rationale
          ? {
              summary: rationale.body?.summary || rationale.body?.comment,
              rationale_statement: rationale.body?.rationaleStatement,
              conclusion: rationale.body?.conclusion,
              precedent_discussion: rationale.body?.precedentDiscussion,
              counterargument_discussion: rationale.body?.counterargumentDiscussion,
              internal_vote: rationale.body?.internalVote,
              references: rationale.body?.references,
              authors: rationale.authors?.map((a) => a.name || a.did),
            }
          : null,
        anchor_url: row.anchor_url,
        anchor_hash: row.anchor_hash,
      };

      return createJsonResult(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving vote rationale: ${errorMessage}`, true);
    }
  },
};

export const getDrepVotingHistory: ToolHandler = {
  definition: {
    name: "get_drep_voting_history",
    description: `Get the voting history for a specific DRep with their rationales.

Returns all votes cast by the DRep including:
- Vote choice (YES/NO/ABSTAIN)
- Proposal details
- Rationale summary for each vote
- Voting power at time of vote`,
    inputSchema: {
      type: "object",
      properties: {
        drep_id: {
          type: "string",
          description: "The DRep ID (e.g., 'drep1...')",
        },
        include_rationale: {
          type: "boolean",
          description: "Include rationale summaries (default: true)",
        },
        vote_filter: {
          type: "string",
          enum: ["YES", "NO", "ABSTAIN"],
          description: "Optional: filter by vote type",
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
          description: "Maximum results to return (default: 20, max: 100)",
        },
      },
      required: ["drep_id"],
    },
  },
  handler: async (args) => {
    const {
      drep_id,
      include_rationale = true,
      vote_filter,
      governance_action_type,
      limit = 20,
    } = args as {
      drep_id: string;
      include_rationale?: boolean;
      vote_filter?: string;
      governance_action_type?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [drep_id];
    let paramIndex = 2;

    let sql = `
      SELECT
        v.id,
        v.vote,
        v.proposal_id,
        v.rationale,
        v.anchor_url,
        v.voted_at,
        v.voting_power,
        p.title as proposal_title,
        p.governance_action_type,
        p.status as proposal_status,
        d.name as drep_name,
        d.voting_power as current_voting_power
      FROM onchain_vote v
      LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
      LEFT JOIN drep d ON v.drep_id = d.drep_id
      WHERE v.drep_id = $1
    `;

    if (vote_filter) {
      sql += ` AND v.vote = $${paramIndex}`;
      params.push(vote_filter);
      paramIndex++;
    }

    if (governance_action_type) {
      sql += ` AND p.governance_action_type = $${paramIndex}`;
      params.push(governance_action_type);
      paramIndex++;
    }

    sql += ` ORDER BY v.voted_at DESC LIMIT $${paramIndex}`;
    params.push(maxLimit);

    try {
      const result = await query(sql, params);

      if (result.rows.length === 0) {
        return createTextResult(`No voting history found for DRep: ${drep_id}`);
      }

      const drepName = result.rows[0].drep_name;
      const currentVotingPower = result.rows[0].current_voting_power;

      const votes = result.rows.map((row) => {
        const rationale = include_rationale ? parseRationale(row.rationale) : null;
        return {
          vote_id: row.id,
          vote: row.vote,
          proposal_id: row.proposal_id,
          proposal_title: row.proposal_title,
          governance_action_type: row.governance_action_type,
          proposal_status: row.proposal_status,
          voting_power_at_vote: row.voting_power?.toString(),
          voted_at: row.voted_at,
          has_rationale: !!row.rationale,
          rationale_summary: include_rationale ? extractRationaleSummary(rationale) : undefined,
          anchor_url: row.anchor_url,
        };
      });

      // Vote distribution
      const voteCounts = { YES: 0, NO: 0, ABSTAIN: 0 };
      result.rows.forEach((row) => {
        if (row.vote in voteCounts) {
          voteCounts[row.vote as keyof typeof voteCounts]++;
        }
      });

      return createJsonResult({
        drep: {
          id: drep_id,
          name: drepName,
          current_voting_power: currentVotingPower?.toString(),
        },
        vote_summary: {
          total_votes: result.rows.length,
          with_rationale: result.rows.filter((r) => r.rationale).length,
          distribution: voteCounts,
        },
        votes,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving DRep voting history: ${errorMessage}`, true);
    }
  },
};

export const getProposalRationales: ToolHandler = {
  definition: {
    name: "get_proposal_rationales",
    description: `Get all voting rationales for a specific proposal.

Returns all votes with rationales for a governance action, grouped by vote choice (YES/NO/ABSTAIN) and voter type (DREP/SPO/CC). Useful for understanding the reasoning behind community decisions.`,
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: {
          type: "string",
          description: "The proposal ID to get rationales for",
        },
        voter_type: {
          type: "string",
          enum: ["DREP", "SPO", "CC"],
          description: "Optional: filter by voter type",
        },
        vote_filter: {
          type: "string",
          enum: ["YES", "NO", "ABSTAIN"],
          description: "Optional: filter by vote type",
        },
        only_with_rationale: {
          type: "boolean",
          description: "Only return votes that have rationale (default: true)",
        },
        limit: {
          type: "number",
          description: "Maximum results per vote type (default: 20)",
        },
      },
      required: ["proposal_id"],
    },
  },
  handler: async (args) => {
    const {
      proposal_id,
      voter_type,
      vote_filter,
      only_with_rationale = true,
      limit = 20,
    } = args as {
      proposal_id: string;
      voter_type?: string;
      vote_filter?: string;
      only_with_rationale?: boolean;
      limit?: number;
    };

    // First get proposal details
    const proposalResult = await query(
      `SELECT * FROM proposal WHERE proposal_id = $1`,
      [proposal_id]
    );

    if (proposalResult.rows.length === 0) {
      return createTextResult(`Proposal not found: ${proposal_id}`, true);
    }

    const proposal = proposalResult.rows[0];

    // Build vote query
    const params: unknown[] = [proposal_id];
    let paramIndex = 2;

    let sql = `
      SELECT
        v.id,
        v.vote,
        v.voter_type,
        v.drep_id,
        v.spo_id,
        v.cc_id,
        v.rationale,
        v.anchor_url,
        v.voted_at,
        v.voting_power,
        d.name as drep_name
      FROM onchain_vote v
      LEFT JOIN drep d ON v.drep_id = d.drep_id
      WHERE v.proposal_id = $1
    `;

    if (only_with_rationale) {
      sql += ` AND v.rationale IS NOT NULL`;
    }

    if (voter_type) {
      sql += ` AND v.voter_type = $${paramIndex}`;
      params.push(voter_type);
      paramIndex++;
    }

    if (vote_filter) {
      sql += ` AND v.vote = $${paramIndex}`;
      params.push(vote_filter);
      paramIndex++;
    }

    sql += ` ORDER BY v.voting_power DESC NULLS LAST, v.voted_at DESC`;

    try {
      const result = await query(sql, params);

      // Group by vote type
      const groupedVotes: Record<string, unknown[]> = {
        YES: [],
        NO: [],
        ABSTAIN: [],
      };

      result.rows.forEach((row) => {
        const voteType = row.vote as string;
        if (groupedVotes[voteType] && groupedVotes[voteType].length < limit) {
          const rationale = parseRationale(row.rationale);
          groupedVotes[voteType].push({
            voter_type: row.voter_type,
            voter_id: row.drep_id || row.spo_id || row.cc_id,
            voter_name: row.drep_name,
            voting_power: row.voting_power?.toString(),
            voted_at: row.voted_at,
            rationale_summary: extractRationaleSummary(rationale),
            anchor_url: row.anchor_url,
          });
        }
      });

      // Vote statistics
      const statsResult = await query(
        `
        SELECT
          vote,
          voter_type,
          COUNT(*) as count,
          SUM(voting_power) as total_power,
          COUNT(rationale) as with_rationale
        FROM onchain_vote
        WHERE proposal_id = $1
        GROUP BY vote, voter_type
        ORDER BY vote, voter_type
      `,
        [proposal_id]
      );

      return createJsonResult({
        proposal: {
          id: proposal.proposal_id,
          title: proposal.title,
          governance_action_type: proposal.governance_action_type,
          status: proposal.status,
          description: proposal.description?.substring(0, 500),
        },
        vote_statistics: statsResult.rows.map((r) => ({
          vote: r.vote,
          voter_type: r.voter_type,
          count: parseInt(r.count),
          total_voting_power: r.total_power?.toString(),
          with_rationale: parseInt(r.with_rationale),
        })),
        rationales: {
          yes: groupedVotes.YES,
          no: groupedVotes.NO,
          abstain: groupedVotes.ABSTAIN,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving proposal rationales: ${errorMessage}`, true);
    }
  },
};

export const getRationaleStats: ToolHandler = {
  definition: {
    name: "get_rationale_stats",
    description: `Get statistics about voting rationale coverage across the governance system.

Returns:
- Total votes and rationale coverage by voter type
- Coverage by governance action type
- Top DReps by rationale provision
- Recent rationale activity`,
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
    const { governance_action_type } = args as {
      governance_action_type?: string;
    };

    try {
      // Overall stats
      const overallSql = governance_action_type
        ? `
          SELECT
            v.voter_type,
            COUNT(*) as total_votes,
            COUNT(v.rationale) as with_rationale,
            COUNT(v.anchor_url) as with_anchor
          FROM onchain_vote v
          JOIN proposal p ON v.proposal_id = p.proposal_id
          WHERE p.governance_action_type = $1
          GROUP BY v.voter_type
          ORDER BY v.voter_type
        `
        : `
          SELECT
            voter_type,
            COUNT(*) as total_votes,
            COUNT(rationale) as with_rationale,
            COUNT(anchor_url) as with_anchor
          FROM onchain_vote
          GROUP BY voter_type
          ORDER BY voter_type
        `;

      const overallResult = await query(
        overallSql,
        governance_action_type ? [governance_action_type] : []
      );

      // By governance action type
      const byTypeResult = await query(`
        SELECT
          p.governance_action_type,
          COUNT(*) as total_votes,
          COUNT(v.rationale) as with_rationale,
          ROUND(COUNT(v.rationale)::numeric / COUNT(*)::numeric * 100, 1) as rationale_pct
        FROM onchain_vote v
        JOIN proposal p ON v.proposal_id = p.proposal_id
        GROUP BY p.governance_action_type
        ORDER BY total_votes DESC
      `);

      // Top DReps by rationale provision
      const topDrepsResult = await query(`
        SELECT
          v.drep_id,
          d.name as drep_name,
          COUNT(*) as total_votes,
          COUNT(v.rationale) as with_rationale,
          ROUND(COUNT(v.rationale)::numeric / COUNT(*)::numeric * 100, 1) as rationale_pct
        FROM onchain_vote v
        JOIN drep d ON v.drep_id = d.drep_id
        WHERE v.voter_type = 'DREP'
        GROUP BY v.drep_id, d.name
        HAVING COUNT(*) >= 5
        ORDER BY with_rationale DESC, rationale_pct DESC
        LIMIT 10
      `);

      // Recent rationale activity
      const recentResult = await query(`
        SELECT
          v.drep_id,
          d.name as drep_name,
          v.vote,
          p.title as proposal_title,
          v.voted_at
        FROM onchain_vote v
        JOIN proposal p ON v.proposal_id = p.proposal_id
        LEFT JOIN drep d ON v.drep_id = d.drep_id
        WHERE v.rationale IS NOT NULL
        ORDER BY v.voted_at DESC
        LIMIT 10
      `);

      return createJsonResult({
        filter: governance_action_type || "all",
        by_voter_type: overallResult.rows.map((r) => ({
          voter_type: r.voter_type,
          total_votes: parseInt(r.total_votes),
          with_rationale: parseInt(r.with_rationale),
          with_anchor: parseInt(r.with_anchor),
          rationale_coverage: `${((parseInt(r.with_rationale) / parseInt(r.total_votes)) * 100).toFixed(1)}%`,
        })),
        by_governance_type: byTypeResult.rows.map((r) => ({
          governance_action_type: r.governance_action_type,
          total_votes: parseInt(r.total_votes),
          with_rationale: parseInt(r.with_rationale),
          rationale_coverage: `${r.rationale_pct}%`,
        })),
        top_dreps_by_rationale: topDrepsResult.rows.map((r) => ({
          drep_id: r.drep_id,
          name: r.drep_name,
          total_votes: parseInt(r.total_votes),
          with_rationale: parseInt(r.with_rationale),
          coverage: `${r.rationale_pct}%`,
        })),
        recent_rationales: recentResult.rows.map((r) => ({
          voter: r.drep_name || r.drep_id,
          vote: r.vote,
          proposal: r.proposal_title,
          voted_at: r.voted_at,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving rationale stats: ${errorMessage}`, true);
    }
  },
};
