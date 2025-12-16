import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { createTextResult } from "./types/index.js";

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
