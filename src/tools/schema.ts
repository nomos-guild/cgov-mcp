import { query } from "../db/index.js";
import { createJsonResult, type ToolHandler } from "../types/index.js";

export const listTables: ToolHandler = {
  definition: {
    name: "list_tables",
    description: "List all tables in the database with their schemas",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: async () => {
    const result = await query(`
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    return createJsonResult(result.rows);
  },
};

export const describeTable: ToolHandler = {
  definition: {
    name: "describe_table",
    description:
      "Get the schema/structure of a specific table including column names, types, and constraints",
    inputSchema: {
      type: "object",
      properties: {
        table_name: {
          type: "string",
          description: "The name of the table to describe",
        },
        schema_name: {
          type: "string",
          description: "The schema name (defaults to 'public')",
        },
      },
      required: ["table_name"],
    },
  },
  handler: async (args) => {
    const { table_name, schema_name = "public" } = args as {
      table_name: string;
      schema_name?: string;
    };

    const result = await query(
      `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
      [schema_name, table_name]
    );
    return createJsonResult(result.rows);
  },
};
