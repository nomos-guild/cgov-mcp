import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolHandler {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export function createTextResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError && { isError: true }),
  };
}

export function createJsonResult(data: unknown, isError = false): CallToolResult {
  return createTextResult(JSON.stringify(data, null, 2), isError);
}
