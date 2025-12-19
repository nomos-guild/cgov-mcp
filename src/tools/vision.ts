import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createTextResult, type ToolHandler } from "../types/index.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the vision file (relative to project root)
const VISION_PATH = join(__dirname, "../../static/cardano-vision-2030.md");

interface Section {
  title: string;
  content: string;
  level: number;
  startLine: number;
  endLine: number;
}

function loadVision(): string {
  return readFileSync(VISION_PATH, "utf-8");
}

function parseIntoSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  // Skip frontmatter
  let inFrontmatter = false;
  let contentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle frontmatter
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") {
        inFrontmatter = false;
        contentStartLine = i + 1;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: headingMatch[2].trim(),
        content: line,
        level: headingMatch[1].length,
        startLine: i,
        endLine: i,
      };
    } else if (currentSection) {
      currentSection.content += "\n" + line;
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
}

function searchVision(
  query: string,
  sections: Section[]
): { matches: Section[]; snippets: string[] } {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  const matches: Section[] = [];
  const snippets: string[] = [];

  for (const section of sections) {
    const contentLower = section.content.toLowerCase();
    const titleLower = section.title.toLowerCase();

    // Check if any query term matches
    const matchesQuery =
      queryTerms.some((term) => contentLower.includes(term)) ||
      queryTerms.some((term) => titleLower.includes(term));

    if (matchesQuery) {
      matches.push(section);

      // Extract relevant snippets around the match
      const lines = section.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (queryTerms.some((term) => lineLower.includes(term))) {
          // Get context: line before, matching line, line after
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          const snippet = lines.slice(start, end).join("\n").trim();
          if (snippet && !snippets.includes(snippet)) {
            snippets.push(snippet);
          }
        }
      }
    }
  }

  return { matches, snippets };
}

export const searchVisionTool: ToolHandler = {
  definition: {
    name: "search_vision_2030",
    description: `Search the Cardano Vision 2030 Strategic Framework document. The vision outlines Cardano's strategy to become "The World's Operating System" by 2030.

The document contains:
- Executive Summary with 4 key objectives
- Core KPIs (TVL, Monthly transactions, MAU, Uptime, Revenue, etc.)
- Pillar 1: Infrastructure & Research Excellence (Scalability, Security, L2, ZK)
- Pillar 2: Adoption & Utility (DeFi, RWA, Payments, Developer Experience)
- Pillar 3: Governance (DRep incentives, Turnout-aware voting, Treasury seasons)
- Pillar 4: Community & Ecosystem Growth (Talent, Global engagement)
- Pillar 5: Ecosystem Sustainability (Treasury management, SPO incentives)

Use this tool to find strategic objectives, KPI targets, pillar details, and specific focus areas.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query - can be keywords, phrases, or topics (e.g., 'TVL target', 'DeFi strategy', 'SPO incentives', 'governance', 'KPI')",
        },
        pillar: {
          type: "string",
          description:
            "Optional: filter by pillar (e.g., 'Pillar 1', 'Infrastructure', 'Governance', 'Adoption')",
        },
        include_full_sections: {
          type: "boolean",
          description:
            "If true, return full matching sections. If false (default), return only relevant snippets.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const { query, pillar, include_full_sections } = args as {
      query: string;
      pillar?: string;
      include_full_sections?: boolean;
    };

    try {
      const content = loadVision();
      let sections = parseIntoSections(content);

      // Filter by pillar if specified
      if (pillar) {
        const pillarLower = pillar.toLowerCase();
        sections = sections.filter(
          (s) =>
            s.title.toLowerCase().includes(pillarLower) ||
            s.content.toLowerCase().includes(pillarLower)
        );
      }

      const { matches, snippets } = searchVision(query, sections);

      if (matches.length === 0) {
        return createTextResult(
          `No matches found for "${query}" in the Cardano Vision 2030 document.${pillar ? ` (searched within: ${pillar})` : ""}`
        );
      }

      let result = `Found ${matches.length} matching section(s) for "${query}":\n\n`;

      if (include_full_sections) {
        // Return full sections
        for (const match of matches.slice(0, 5)) {
          result += `## ${match.title}\n`;
          result += `${match.content}\n\n`;
          result += "---\n\n";
        }
        if (matches.length > 5) {
          result += `... and ${matches.length - 5} more sections. Refine your query for more specific results.\n`;
        }
      } else {
        // Return matching section titles and snippets
        result += "### Matching Sections:\n";
        for (const match of matches.slice(0, 10)) {
          result += `- ${match.title}\n`;
        }
        if (matches.length > 10) {
          result += `  ... and ${matches.length - 10} more\n`;
        }

        result += "\n### Relevant Excerpts:\n\n";
        for (const snippet of snippets.slice(0, 10)) {
          result += `> ${snippet.replace(/\n/g, "\n> ")}\n\n`;
        }
        if (snippets.length > 10) {
          result += `... and ${snippets.length - 10} more excerpts. Use include_full_sections=true for complete text.\n`;
        }
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error searching vision document: ${errorMessage}`, true);
    }
  },
};

export const getVisionSection: ToolHandler = {
  definition: {
    name: "get_vision_section",
    description: `Get a specific section of the Cardano Vision 2030 document by name. Useful for retrieving exact text of pillars, KPIs, or focus areas.

Available sections include:
- Executive Summary
- Core Key Performance Indicators (KPIs)
- Pillar 1: Infrastructure & Research Excellence
  - I.1. Scalability & Interoperability
  - I.2. Security & Resilience
- Pillar 2: Adoption & Utility
  - A.1. High-Value Verticals
  - A.2. Experience (Business & Consumer)
  - A.3. Developer Experience
- Pillar 3: Governance
  - G.1. Incentivized & Accessible Governance
  - G.2. Turnout-Aware Voting with Delegator Safeguard
  - G.3. Treasury Seasons
- Pillar 4: Community & Ecosystem Growth
  - C.1. Talent Acquisition & Retention
  - C.2. Global Engagement & Market Adoption
- Pillar 5: Ecosystem Sustainability & Resilience
  - E.1. Financial Stewardship & Tokenomics
  - E.2. SPO Incentives`,
    inputSchema: {
      type: "object",
      properties: {
        section_name: {
          type: "string",
          description:
            "Name of the section to retrieve (e.g., 'Executive Summary', 'Pillar 1', 'KPI', 'Treasury Seasons', 'SPO Incentives')",
        },
      },
      required: ["section_name"],
    },
  },
  handler: async (args) => {
    const { section_name } = args as { section_name: string };

    try {
      const content = loadVision();
      const sections = parseIntoSections(content);
      const searchLower = section_name.toLowerCase();

      // Find matching section(s)
      const matches = sections.filter((s) => {
        const titleLower = s.title.toLowerCase();

        // Exact or partial title match
        if (titleLower.includes(searchLower)) return true;

        // Check for pillar number matching (e.g., "Pillar 1" or "1")
        if (searchLower.match(/^pillar\s*\d$/i) || searchLower.match(/^\d$/)) {
          const pillarNum = searchLower.replace(/\D/g, "");
          if (titleLower.includes(`pillar ${pillarNum}`)) return true;
        }

        // Check for section code matching (e.g., "I.1", "A.2", "G.3")
        const sectionCodeMatch = searchLower.match(/^([a-z])\.(\d)$/i);
        if (sectionCodeMatch) {
          const pattern = `${sectionCodeMatch[1]}.${sectionCodeMatch[2]}`;
          if (titleLower.includes(pattern.toLowerCase())) return true;
        }

        return false;
      });

      if (matches.length === 0) {
        return createTextResult(
          `Section "${section_name}" not found in the Cardano Vision 2030 document.\n\nTry searching for:\n- Pillar names (e.g., "Pillar 1", "Infrastructure", "Governance")\n- Section codes (e.g., "I.1", "A.2", "G.3")\n- Keywords (e.g., "KPI", "Treasury", "SPO", "DeFi")`
        );
      }

      let result = "";

      // Return full matching sections
      for (const match of matches.slice(0, 3)) {
        result += `## ${match.title}\n\n`;
        result += `${match.content}\n\n`;
        result += "---\n\n";
      }

      if (matches.length > 3) {
        result += `\n... and ${matches.length - 3} more matching sections.\n`;
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving section: ${errorMessage}`, true);
    }
  },
};

export const getVisionKPIs: ToolHandler = {
  definition: {
    name: "get_vision_kpis",
    description: `Get the Cardano Vision 2030 Key Performance Indicators (KPIs) and their targets. Returns the core KPIs that measure Cardano's progress toward 2030 goals.

Core KPIs include:
- Total Value Locked (TVL): Target $3B
- Monthly Transactions: Target ≥27M
- Monthly Active Users (MAU): Target 1M
- Uptime: Target 99.98%
- Annual Protocol Revenue: Target ≥16M ada
- DRep Participation Rate: Target >70%
- Throughput Capacity: Target 3x current`,
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Optional: filter by KPI category (e.g., 'Adoption', 'Reliability', 'Governance', 'Revenue', 'Scalability')",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { category } = args as { category?: string };

    try {
      const content = loadVision();

      // Extract the KPI tables from the content
      const kpiSection = content.match(
        /## Core Key Performance Indicators \(KPIs\)[\s\S]*?(?=## Pillar 1)/
      );

      if (!kpiSection) {
        return createTextResult("Could not find KPI section in the vision document.");
      }

      let result = "# Cardano Vision 2030 - Key Performance Indicators\n\n";

      if (category) {
        const categoryLower = category.toLowerCase();
        const lines = kpiSection[0].split("\n");
        const filteredLines: string[] = [];
        let inTable = false;
        let tableHeader = "";

        for (const line of lines) {
          if (line.startsWith("|") && line.includes("Area")) {
            inTable = true;
            tableHeader = line;
            filteredLines.push(line);
            continue;
          }
          if (line.startsWith("| :")) {
            filteredLines.push(line);
            continue;
          }
          if (inTable && line.startsWith("|")) {
            if (line.toLowerCase().includes(categoryLower)) {
              filteredLines.push(line);
            }
          } else if (!line.startsWith("|")) {
            inTable = false;
          }
        }

        if (filteredLines.length > 2) {
          result += `Filtered by category: ${category}\n\n`;
          result += filteredLines.join("\n");
        } else {
          result += `No KPIs found for category "${category}".\n\n`;
          result += "Available categories: Adoption, Reliability, Operational resilience, Revenue, Governance, Scalability\n\n";
          result += "Showing all KPIs:\n\n";
          result += kpiSection[0];
        }
      } else {
        result += kpiSection[0];
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving KPIs: ${errorMessage}`, true);
    }
  },
};
