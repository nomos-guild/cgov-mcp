import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const searchCCMembers: ToolHandler = {
  definition: {
    name: "search_cc_members",
    description: `Search Constitutional Committee (CC) members by name, ID, or credential.

Returns CC member profiles with their hot/cold credentials and status.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - member name, CC ID, or credential prefix",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const { query: searchQuery, limit = 20 } = args as {
      query: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 50);

    const sql = `
      SELECT
        cc_id,
        member_name,
        hot_credential,
        cold_credential,
        status,
        created_at,
        updated_at
      FROM cc
      WHERE (
        member_name ILIKE $1
        OR cc_id ILIKE $1
        OR hot_credential ILIKE $1
        OR cold_credential ILIKE $1
      )
      ORDER BY member_name ASC NULLS LAST
      LIMIT $2
    `;

    try {
      const result = await query(sql, [`%${searchQuery}%`, maxLimit]);

      if (result.rows.length === 0) {
        return createTextResult(`No CC members found matching "${searchQuery}"`);
      }

      return createJsonResult({
        total_results: result.rows.length,
        members: result.rows.map((r) => ({
          cc_id: r.cc_id,
          member_name: r.member_name,
          hot_credential: r.hot_credential,
          cold_credential: r.cold_credential,
          status: r.status,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching CC members: ${errorMessage}`, true);
    }
  },
};

export const getCCVotingHistory: ToolHandler = {
  definition: {
    name: "get_cc_voting_history",
    description: `Get the voting history for a specific Constitutional Committee member.

Returns all votes cast by the CC member including vote choice, proposal details, and rationale.`,
    inputSchema: {
      type: "object",
      properties: {
        cc_id: {
          type: "string",
          description: "The CC member ID",
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
      required: ["cc_id"],
    },
  },
  handler: async (args) => {
    const { cc_id, vote_filter, limit = 20 } = args as {
      cc_id: string;
      vote_filter?: string;
      limit?: number;
    };

    const maxLimit = Math.min(limit, 100);
    const params: unknown[] = [cc_id];
    let paramIndex = 2;

    let sql = `
      SELECT
        v.id,
        v.vote,
        v.proposal_id,
        v.rationale,
        v.anchor_url,
        v.voted_at,
        p.title as proposal_title,
        p.governance_action_type,
        p.status as proposal_status,
        c.member_name
      FROM onchain_vote v
      LEFT JOIN proposal p ON v.proposal_id = p.proposal_id
      LEFT JOIN cc c ON v.cc_id = c.cc_id
      WHERE v.cc_id = $1
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
        return createTextResult(`No voting history found for CC member: ${cc_id}`);
      }

      const memberName = result.rows[0].member_name;
      const voteCounts = { YES: 0, NO: 0, ABSTAIN: 0 };
      result.rows.forEach((row) => {
        if (row.vote in voteCounts) {
          voteCounts[row.vote as keyof typeof voteCounts]++;
        }
      });

      return createJsonResult({
        cc_member: {
          id: cc_id,
          name: memberName,
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
          voted_at: r.voted_at,
          has_rationale: !!r.rationale,
          anchor_url: r.anchor_url,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting CC voting history: ${errorMessage}`, true);
    }
  },
};

export const getCommitteeState: ToolHandler = {
  definition: {
    name: "get_committee_state",
    description: `Get the current Constitutional Committee state including member count, eligibility, and quorum requirements.`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: async () => {
    try {
      const stateResult = await query(
        `SELECT * FROM committee_state WHERE id = 'current'`
      );

      const membersResult = await query(
        `SELECT cc_id, member_name, status FROM cc ORDER BY member_name ASC NULLS LAST`
      );

      const state = stateResult.rows[0];

      return createJsonResult({
        committee_state: state
          ? {
              epoch: state.epoch,
              total_members: state.total_members,
              eligible_members: state.eligible_members,
              quorum: `${state.quorum_numerator}/${state.quorum_denominator}`,
              is_committee_valid: state.is_committee_valid,
              updated_at: state.updated_at,
            }
          : null,
        members: membersResult.rows.map((m) => ({
          cc_id: m.cc_id,
          member_name: m.member_name,
          status: m.status,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error getting committee state: ${errorMessage}`, true);
    }
  },
};
