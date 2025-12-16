import { query } from "../db/index.js";
import { createJsonResult, createTextResult, type ToolHandler } from "../types/index.js";

export const queryDatabase: ToolHandler = {
  definition: {
    name: "query_database",
    description:
      "Execute a read-only SQL query against the PostgreSQL database. Use this to search and retrieve information.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "The SQL SELECT query to execute",
        },
      },
      required: ["sql"],
    },
  },
  handler: async (args) => {
    const sql = (args as { sql: string }).sql;

    // Basic validation - only allow SELECT statements
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith("SELECT") && !trimmedSql.startsWith("WITH")) {
      return createTextResult(
        "Error: Only SELECT queries are allowed. This is a read-only database connection.",
        true
      );
    }

    const result = await query(sql);
    return createJsonResult(result.rows);
  },
};
