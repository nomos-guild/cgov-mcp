import type { ToolHandler } from "../types/index.js";

// Schema tools
import { listTables, describeTable } from "./schema.js";

// Query tools
import { queryDatabase } from "./query.js";

// Constitution tools
import { searchConstitutionTool, getConstitutionSection } from "./constitution.js";

// Export all tools as a registry
export const tools: ToolHandler[] = [
  // Generic tools
  queryDatabase,
  listTables,
  describeTable,
  // Constitution tools
  searchConstitutionTool,
  getConstitutionSection,
];

// Export individual tools for direct access
export { queryDatabase } from "./query.js";
export { listTables, describeTable } from "./schema.js";
export { searchConstitutionTool, getConstitutionSection } from "./constitution.js";
