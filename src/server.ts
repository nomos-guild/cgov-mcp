import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { createTextResult } from "./types/index.js";

// Server-level instructions surfaced to the host (Claude, Gemini, etc.) via the
// MCP initialize handshake. Consolidates the repetitive guidance that used to
// live in every tool description (lovelace conversion, etc.) and — critically —
// pins the citation rules so the agent never has to invent URLs.
//
// Conventions for editing:
//  - Keep this terse. Every byte here lives in every model turn's prompt.
//  - Express rules, not narrative. Bullets > paragraphs.
//  - When in doubt, prefer a rule in here over repeating it across N tools.
const INSTRUCTIONS = [
  "# cgov-mcp house rules",
  "",
  "## URLs / citations",
  "- Every entity tool returns a `url` field. When citing a DRep, proposal, or treasury entity, copy that `url` verbatim — never construct one from an ID.",
  "- Treasury-withdrawal proposals also carry a `funding_entity` object (entity_id + label + url). When the user asks who submitted/funded a proposal, use that — don't re-derive from the title.",
  "- To resolve a user-mentioned entity name to its slug+url, call `search_treasury_entities`. To list all proposals by an entity, call `get_entity_proposals`. Never invent `/treasury/*` paths.",
  "- SPOs and CC members have no public app.cgov.io page; do not invent one. Cite by name + on-chain ID instead.",
  "",
  "## Numbers",
  "- All `*_power`, `*_amount`, stake/voting fields are in lovelace. 1 ADA = 1,000,000 lovelace.",
  "- When summarising a vote, prefer the pre-computed `*_pct_of_active` / `participation_pct` fields over the raw lovelace amounts.",
  "",
  "## Errors",
  "- If a tool returns an error or empty result, surface that to the user. Do NOT answer the underlying question from general knowledge — the governance numbers change weekly and stale answers are worse than \"I couldn't fetch this\".",
].join("\n");

export function createServer(): Server {
  const server = new Server(
    {
      name: "cgov-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: INSTRUCTIONS,
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => t.definition),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.definition.name === name);
    if (!tool) {
      return createTextResult(`Unknown tool: ${name}`, true);
    }

    try {
      return await tool.handler(args ?? {});
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return createTextResult(`Database error: ${errorMessage}`, true);
    }
  });

  return server;
}
