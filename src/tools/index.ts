import type { ToolHandler } from "../types/index.js";

// Schema tools
import { listTables, describeTable } from "./schema.js";

// Query tools
import { queryDatabase } from "./query.js";

// Constitution tools
import { searchConstitutionTool, getConstitutionSection } from "./constitution.js";

// Vision 2030 tools
import { searchVisionTool, getVisionSection, getVisionKPIs } from "./vision.js";

// Export all tools as a registry
export const tools: ToolHandler[] = [
  // Generic tools
  queryDatabase,
  listTables,
  describeTable,
  // Constitution tools
  searchConstitutionTool,
  getConstitutionSection,
  // Vision 2030 tools
  searchVisionTool,
  getVisionSection,
  getVisionKPIs,
];

// Export individual tools for direct access
export { queryDatabase } from "./query.js";
export { listTables, describeTable } from "./schema.js";
export { searchConstitutionTool, getConstitutionSection } from "./constitution.js";
export { searchVisionTool, getVisionSection, getVisionKPIs } from "./vision.js";
