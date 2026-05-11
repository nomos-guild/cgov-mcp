import { query } from "../db/index.js";
import { searchTreasuryEntities, TREASURY_ENTITIES } from "../lib/treasury-entities.js";
import { getProposalsByEntity } from "../lib/treasury-proposals.js";
import { proposalUrl, treasuryEntityUrl } from "../lib/urls.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

// Why this tool exists: the cgov treasury-entity registry (Orion Fund → "draper-dragon",
// IOG → "input-output", etc.) is a curated TypeScript map in the cgov frontend, NOT a
// table in the postgres governance DB. Without this tool, an agent asked "what's the
// Orion Fund page on cgov?" has no way to resolve the slug — and previously fabricated
// URLs like /treasury/entities. This tool returns the exact slug and canonical url.

export const searchTreasuryEntitiesTool: ToolHandler = {
  definition: {
    name: "search_treasury_entities",
    description:
      "Resolve a treasury-funded entity (org, project, vendor) by name or alias to its canonical `entity_id` slug and `url` on app.cgov.io. Use this whenever the user mentions a Cardano treasury entity (e.g. 'Orion Fund', 'Snek Foundation', 'IOG', 'Intersect') to avoid fabricating URLs. Returns ranked matches.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Entity name, alias, or slug. Matches against label, aliases, and entityId (case- and punctuation-insensitive). E.g. 'Orion Fund', 'draper-dragon', 'IOG'.",
        },
        limit: {
          type: "number",
          description: "Maximum matches to return (default: 5, max: 20)",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };
    const maxLimit = Math.min(Math.max(limit, 1), 20);

    const matches = searchTreasuryEntities(query, maxLimit);

    if (matches.length === 0) {
      return createJsonResult({
        query,
        matches: [],
        note:
          "No treasury entity matched. The registry only contains entities that have appeared in on-chain treasury withdrawal proposals. Either the entity is new (not yet curated) or the user meant something else.",
      });
    }

    return createJsonResult({
      query,
      total_matches: matches.length,
      matches: matches.map((m) => ({
        entity_id: m.entity.entityId,
        label: m.entity.label,
        url: treasuryEntityUrl(m.entity.entityId),
        matched_on: m.matchedOn,
      })),
    });
  },
};

export const getEntityProposalsTool: ToolHandler = {
  definition: {
    name: "get_entity_proposals",
    description:
      "List every treasury-withdrawal proposal funded by a given entity (e.g. all proposals submitted by 'snek-foundation' or 'input-output'). Joins the curated proposer registry with the proposal table so each row carries the proposal's title, status, withdrawal amount, epochs, and canonical `url` alongside the entity's `url`.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description:
            "The entity slug (e.g. 'snek-foundation', 'input-output', 'draper-dragon'). Use `search_treasury_entities` first if you only have a label/alias.",
        },
      },
      required: ["entity_id"],
    },
  },
  handler: async (args) => {
    const { entity_id } = args as { entity_id: string };

    const entity = TREASURY_ENTITIES.find((e) => e.entityId === entity_id);
    if (!entity) {
      return createJsonResult({
        entity_id,
        matched: false,
        note: "No such curated entity. Call `search_treasury_entities` to resolve a label to a slug.",
      });
    }

    const proposalIds = getProposalsByEntity(entity_id);
    if (proposalIds.length === 0) {
      return createJsonResult({
        entity: {
          entity_id: entity.entityId,
          label: entity.label,
          url: treasuryEntityUrl(entity.entityId),
        },
        total_proposals: 0,
        proposals: [],
        note:
          "Entity exists in the registry but has no curated proposal mappings. The frontend's title heuristic may still attribute proposals to this entity at render time — those are not bulk-indexed here.",
      });
    }

    try {
      // Single query, IN clause keyed on the curated proposal IDs.
      const result = await query(
        `SELECT
           proposal_id,
           title,
           status,
           governance_action_type,
           withdrawal_amount,
           submission_epoch,
           ratified_epoch,
           enacted_epoch,
           expired_epoch
         FROM proposal
         WHERE proposal_id = ANY($1::text[])
         ORDER BY submission_epoch DESC NULLS LAST`,
        [proposalIds]
      );

      const found = new Map(result.rows.map((r) => [r.proposal_id, r]));
      const proposals = proposalIds.map((id) => {
        const row = found.get(id);
        return {
          proposal_id: id,
          url: proposalUrl(id),
          // `null` for known-curated-but-not-in-DB proposals (e.g. mapping
          // added before the ingestion job has caught up) — flag rather than
          // silently drop so the gap is observable.
          in_db: !!row,
          title: row?.title ?? null,
          status: row?.status ?? null,
          governance_action_type: row?.governance_action_type ?? null,
          withdrawal_amount_lovelace: row?.withdrawal_amount?.toString() ?? null,
          submission_epoch: row?.submission_epoch ?? null,
          ratified_epoch: row?.ratified_epoch ?? null,
          enacted_epoch: row?.enacted_epoch ?? null,
          expired_epoch: row?.expired_epoch ?? null,
        };
      });

      return createJsonResult({
        entity: {
          entity_id: entity.entityId,
          label: entity.label,
          url: treasuryEntityUrl(entity.entityId),
        },
        total_proposals: proposalIds.length,
        proposals,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error fetching proposals for ${entity_id}: ${errorMessage}`, true);
    }
  },
};

export const listTreasuryEntitiesTool: ToolHandler = {
  definition: {
    name: "list_treasury_entities",
    description:
      "List every curated treasury-funded entity with its canonical `entity_id` slug, display label, and app.cgov.io `url`. Use when the user asks for an overview of treasury entities, or as a fallback after `search_treasury_entities` returns nothing.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: async () => {
    return createJsonResult({
      total: TREASURY_ENTITIES.length,
      entities: TREASURY_ENTITIES.map((e) => ({
        entity_id: e.entityId,
        label: e.label,
        url: treasuryEntityUrl(e.entityId),
        aliases: e.aliases ?? [],
      })),
    });
  },
};
