import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createTextResult, type ToolHandler } from "../types/index.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the voting principles file (relative to project root)
const VOTING_PRINCIPLES_PATH = join(__dirname, "../../static/vision-analysis-criteria.md");

interface Section {
  title: string;
  content: string;
  level: number;
  startLine: number;
  endLine: number;
}

function loadVotingPrinciples(): string {
  return readFileSync(VOTING_PRINCIPLES_PATH, "utf-8");
}

function parseIntoSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

function searchDocument(
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

export const searchVotingPrinciplesTool: ToolHandler = {
  definition: {
    name: "search_voting_principles",
    description: `Search the Cardano Governance Voting Principles 2025-2030 document. This document establishes voting principles for treasury funding decisions aligned with Vision 2030 KPIs.

The document contains:
- Budget Framework: 1,000M ADA over 5 years (200M NCL per year)
- The 9 Vision 2030 KPIs with budget allocations (111.1M ADA each)
- Front-Loaded Funding Model: 10 partitions with decreasing funding intensity
- Recognized Party Requirements for first 30% of KPI progress
- Voting Decision Framework: Capability filter and weighted evaluation criteria
- Annual Review & Adjustment mechanisms

Use this tool to find voting guidelines, budget allocations, KPI definitions, and decision-making frameworks.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query - can be keywords, phrases, or topics (e.g., 'front-loaded', 'recognized party', 'TVL budget', 'voting criteria')",
        },
        section: {
          type: "string",
          description:
            "Optional: specific section to search within (e.g., 'Budget Framework', 'Voting Decision', 'Recognized Party')",
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
    const { query, section, include_full_sections } = args as {
      query: string;
      section?: string;
      include_full_sections?: boolean;
    };

    try {
      const content = loadVotingPrinciples();
      let sections = parseIntoSections(content);

      // Filter by section if specified
      if (section) {
        const sectionLower = section.toLowerCase();
        sections = sections.filter(
          (s) =>
            s.title.toLowerCase().includes(sectionLower) ||
            s.content.toLowerCase().includes(sectionLower)
        );
      }

      const { matches, snippets } = searchDocument(query, sections);

      if (matches.length === 0) {
        return createTextResult(
          `No matches found for "${query}" in the Voting Principles document.${section ? ` (searched within: ${section})` : ""}`
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
      return createTextResult(`Error searching voting principles: ${errorMessage}`, true);
    }
  },
};

export const getVotingPrinciplesSection: ToolHandler = {
  definition: {
    name: "get_voting_principles_section",
    description: `Get a specific section of the Cardano Governance Voting Principles document by name.

Available sections include:
- 1. Overview
- 2. Budget Framework (NCL, Per-KPI Allocation)
- 3. The 9 Vision 2030 KPIs
- 4. Front-Loaded Funding Model (Rationale, 10-Partition Distribution)
- 5. Recognized Party Requirement (First 30% Gate, Definition, Collaboration Requirements)
- 6. Voting Decision Framework (Capability Filter, Weighted Criteria, Budget Alignment)
- 7. Annual Review & Adjustment
- 8. Summary Table: Budget by Year and KPI
- 9. Appendix: KPI Progress Calculation Examples`,
    inputSchema: {
      type: "object",
      properties: {
        section_name: {
          type: "string",
          description:
            "Name of the section to retrieve (e.g., 'Budget Framework', 'Front-Loaded', 'Recognized Party', 'Voting Decision')",
        },
      },
      required: ["section_name"],
    },
  },
  handler: async (args) => {
    const { section_name } = args as { section_name: string };

    try {
      const content = loadVotingPrinciples();
      const sections = parseIntoSections(content);
      const searchLower = section_name.toLowerCase();

      // Find matching section(s)
      const matches = sections.filter((s) => {
        const titleLower = s.title.toLowerCase();

        // Exact or partial title match
        if (titleLower.includes(searchLower)) return true;

        // Check for section number matching (e.g., "Section 2" or just "2")
        if (searchLower.match(/^section\s*\d$/i) || searchLower.match(/^\d\.?\s/)) {
          const sectionNum = searchLower.replace(/\D/g, "");
          if (titleLower.startsWith(sectionNum + ".")) return true;
        }

        return false;
      });

      if (matches.length === 0) {
        return createTextResult(
          `Section "${section_name}" not found in the Voting Principles document.\n\nTry searching for:\n- Section numbers (e.g., "2", "4.2", "5.1")\n- Keywords (e.g., "Budget", "Front-Loaded", "Recognized Party", "Voting Decision")\n- Topics (e.g., "NCL", "KPI", "Partition")`
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

export const getVotingKPIBudgets: ToolHandler = {
  definition: {
    name: "get_voting_kpi_budgets",
    description: `Get the 9 Vision 2030 KPIs and their budget allocations from the Voting Principles document.

Each KPI receives 111.1M ADA over the 5-year period (2025-2030):
1. Total Value Locked (TVL): $200M → $3B
2. Monthly Transactions: 800k → ≥27M
3. Monthly Active Users (MAU): 100-300k → 1M
4. Monthly Uptime: 99.98%
5. DRep Voting Power Distribution: >22 DReps control 50%+1
6. Alternative Node Clients: 1 → ≥2
7. Annual Protocol Revenue: 3.5M → ≥16M ada
8. DRep Participation Rate: >70% active voting
9. Throughput Capacity: 300k → 900k tx/day (3x)`,
    inputSchema: {
      type: "object",
      properties: {
        kpi_number: {
          type: "number",
          description: "Optional: specific KPI number (1-9) to retrieve details for",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { kpi_number } = args as { kpi_number?: number };

    try {
      const content = loadVotingPrinciples();

      // Extract the KPI table
      const kpiTableMatch = content.match(
        /## 3\. The 9 Vision 2030 KPIs[\s\S]*?(?=---)/
      );

      if (!kpiTableMatch) {
        return createTextResult("Could not find KPI section in the voting principles document.");
      }

      let result = "# Vision 2030 KPIs - Budget Allocations\n\n";

      if (kpi_number && kpi_number >= 1 && kpi_number <= 9) {
        // Extract specific KPI row
        const lines = kpiTableMatch[0].split("\n");
        const kpiLines = lines.filter((line) => line.startsWith(`| ${kpi_number}`));

        if (kpiLines.length > 0) {
          result += `## KPI #${kpi_number}\n\n`;
          // Include header
          const headerLine = lines.find((l) => l.includes("| # "));
          const separatorLine = lines.find((l) => l.startsWith("| ---"));
          if (headerLine) result += headerLine + "\n";
          if (separatorLine) result += separatorLine + "\n";
          result += kpiLines.join("\n") + "\n\n";
          result += `**Budget Allocation:** 111.1M ADA over 5 years\n`;
        } else {
          result += `KPI #${kpi_number} not found.\n`;
        }
      } else {
        result += kpiTableMatch[0];
        result += "\n**Total Budget:** 1,000M ADA across all 9 KPIs\n";
        result += "**Per-KPI Allocation:** 111.1M ADA each\n";
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving KPI budgets: ${errorMessage}`, true);
    }
  },
};

export const getFundingPartitions: ToolHandler = {
  definition: {
    name: "get_funding_partitions",
    description: `Get the front-loaded funding distribution model from the Voting Principles document.

The model divides each KPI's 111.1M ADA budget into 10 progress partitions:
- First 10% progress: 18% of budget (20M ADA) - 1.8x multiplier
- First 30% progress: 46% of budget (~51.1M ADA)
- Last 30% progress: 16% of budget (~17.8M ADA)
- Funding intensity ratio: First 10% gets 4.5× more than last 10%

This front-loading ensures early infrastructure investment with compounding returns.`,
    inputSchema: {
      type: "object",
      properties: {
        partition: {
          type: "string",
          description:
            "Optional: specific partition range to retrieve (e.g., '0-10', '30-40', 'first 30%')",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { partition } = args as { partition?: string };

    try {
      const content = loadVotingPrinciples();

      // Extract the partition table section
      const partitionMatch = content.match(
        /## 4\. Front-Loaded Funding Model[\s\S]*?(?=## 5\.)/
      );

      if (!partitionMatch) {
        return createTextResult("Could not find funding partition section in the voting principles document.");
      }

      let result = "# Front-Loaded Funding Model\n\n";

      if (partition) {
        const partitionLower = partition.toLowerCase();
        const lines = partitionMatch[0].split("\n");

        // Filter for specific partition
        const relevantLines: string[] = [];
        let foundHeader = false;

        for (const line of lines) {
          if (line.includes("Progress Partition")) {
            foundHeader = true;
            relevantLines.push(line);
            continue;
          }
          if (line.startsWith("| ---")) {
            relevantLines.push(line);
            continue;
          }
          if (foundHeader && line.startsWith("|")) {
            if (
              line.toLowerCase().includes(partitionLower) ||
              (partitionLower.includes("first 30") &&
                (line.includes("0%") || line.includes("10%") || line.includes("20%")))
            ) {
              relevantLines.push(line);
            }
          }
        }

        if (relevantLines.length > 2) {
          result += `Filtered for: ${partition}\n\n`;
          result += relevantLines.join("\n") + "\n";
        } else {
          result += `No specific partition found for "${partition}". Showing full table:\n\n`;
          result += partitionMatch[0];
        }
      } else {
        result += partitionMatch[0];
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving funding partitions: ${errorMessage}`, true);
    }
  },
};

export const getVotingCriteria: ToolHandler = {
  definition: {
    name: "get_voting_criteria",
    description: `Get the voting decision framework and evaluation criteria from the Voting Principles document.

The framework includes:
- **Preliminary Filter**: Team capability pass/fail check (value created ≥ budget requested)
- **Weighted Evaluation Criteria**:
  - KPI Alignment (35%): Does proposal advance Vision 2030 KPIs?
  - Measurable Impact (30%): Are deliverables quantifiable?
  - Cost Efficiency (20%): Is budget proportional to expected progress?
  - Risk Mitigation (15%): Are milestones/escrow/clawback in place?
- **Budget Alignment Checks**: Partition fit, recognized party requirement`,
    inputSchema: {
      type: "object",
      properties: {
        criterion: {
          type: "string",
          description:
            "Optional: specific criterion to retrieve (e.g., 'capability', 'alignment', 'efficiency', 'risk')",
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    const { criterion } = args as { criterion?: string };

    try {
      const content = loadVotingPrinciples();

      // Extract the voting decision framework section
      const frameworkMatch = content.match(
        /## 6\. Voting Decision Framework[\s\S]*?(?=## 7\.)/
      );

      if (!frameworkMatch) {
        return createTextResult("Could not find voting decision framework in the voting principles document.");
      }

      let result = "# Voting Decision Framework\n\n";

      if (criterion) {
        const criterionLower = criterion.toLowerCase();
        const sections = parseIntoSections(frameworkMatch[0]);

        const matches = sections.filter((s) =>
          s.title.toLowerCase().includes(criterionLower) ||
          s.content.toLowerCase().includes(criterionLower)
        );

        if (matches.length > 0) {
          for (const match of matches) {
            result += `## ${match.title}\n\n`;
            result += `${match.content}\n\n`;
          }
        } else {
          result += `No specific criterion found for "${criterion}". Showing full framework:\n\n`;
          result += frameworkMatch[0];
        }
      } else {
        result += frameworkMatch[0];
      }

      return createTextResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return createTextResult(`Error retrieving voting criteria: ${errorMessage}`, true);
    }
  },
};
