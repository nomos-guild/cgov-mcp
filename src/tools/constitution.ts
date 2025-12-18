import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createTextResult, type ToolHandler } from "../types/index.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the constitution file (relative to project root)
const CONSTITUTION_PATH = join(__dirname, "../../static/cardano-constitution.md");

interface Section {
  title: string;
  content: string;
  level: number;
  startLine: number;
  endLine: number;
}

function loadConstitution(): string {
  return readFileSync(CONSTITUTION_PATH, "utf-8");
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

function searchConstitution(
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

export const searchConstitutionTool: ToolHandler = {
  definition: {
    name: "search_constitution",
    description: `Search the Cardano Constitution for relevant text. The constitution contains:
- Preamble
- Article I: Cardano Blockchain Tenets (10 core tenets) and Guardrails
- Article II: The Cardano Blockchain Community
- Article III: Participatory and Decentralized Governance
- Article IV: The Cardano Blockchain Ecosystem Budget
- Article V: Delegated Representatives (DReps)
- Article VI: Stake Pool Operators (SPOs)
- Article VII: Constitutional Committee (CC)
- Article VIII: Amendment Process
- Appendix I: Cardano Blockchain Guardrails (detailed parameter guardrails)
- Appendix II: Supporting Guidance

Use this tool to find constitutional provisions, tenets, guardrails, governance rules, and other constitutional text.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query - can be keywords, phrases, or topics (e.g., 'treasury withdrawal', 'DRep voting threshold', 'tenet 5', 'hard fork')",
        },
        section: {
          type: "string",
          description:
            "Optional: specific section to search within (e.g., 'Article I', 'Appendix I', 'Preamble', 'Tenet 5')",
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
      const content = loadConstitution();
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

      const { matches, snippets } = searchConstitution(query, sections);

      if (matches.length === 0) {
        return createTextResult(
          `No matches found for "${query}" in the Cardano Constitution.${section ? ` (searched within: ${section})` : ""}`
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
      return createTextResult(`Error searching constitution: ${errorMessage}`, true);
    }
  },
};

export const getConstitutionSection: ToolHandler = {
  definition: {
    name: "get_constitution_section",
    description: `Get a specific section of the Cardano Constitution by name. Useful for retrieving exact text of articles, tenets, or guardrails.

Available sections include:
- PREAMBLE
- ARTICLE I through ARTICLE VIII
- Section numbers (e.g., "Section 1", "Section 2")
- TENET 1 through TENET 10
- APPENDIX I: CARDANO BLOCKCHAIN GUARDRAILS
- APPENDIX II: SUPPORTING GUIDANCE
- Specific guardrail codes (e.g., "PARAM-01", "TREASURY-01a", "HARDFORK-01")`,
    inputSchema: {
      type: "object",
      properties: {
        section_name: {
          type: "string",
          description:
            "Name of the section to retrieve (e.g., 'Article I', 'Tenet 5', 'PARAM-01', 'Preamble')",
        },
      },
      required: ["section_name"],
    },
  },
  handler: async (args) => {
    const { section_name } = args as { section_name: string };

    try {
      const content = loadConstitution();
      const sections = parseIntoSections(content);
      const searchLower = section_name.toLowerCase();

      // Find matching section(s)
      const matches = sections.filter((s) => {
        const titleLower = s.title.toLowerCase();
        const contentLower = s.content.toLowerCase();

        // Exact title match
        if (titleLower.includes(searchLower)) return true;

        // Check for specific patterns
        // Tenet matching (e.g., "Tenet 5" or "TENET 5")
        if (searchLower.startsWith("tenet")) {
          const tenetMatch = searchLower.match(/tenet\s*(\d+)/);
          if (tenetMatch) {
            return contentLower.includes(`**tenet ${tenetMatch[1]}**`);
          }
        }

        // Guardrail code matching (e.g., "PARAM-01", "TREASURY-01a")
        const guardrailPattern = new RegExp(
          `\\b${section_name.replace(/[-]/g, "[-]?")}\\b`,
          "i"
        );
        if (guardrailPattern.test(s.content)) return true;

        return false;
      });

      if (matches.length === 0) {
        return createTextResult(
          `Section "${section_name}" not found in the Cardano Constitution.\n\nTry searching for:\n- Article names (e.g., "Article I", "Article VII")\n- Tenets (e.g., "Tenet 1", "Tenet 10")\n- Guardrail codes (e.g., "PARAM-01", "TREASURY-01a")\n- General terms (e.g., "Preamble", "DReps", "Constitutional Committee")`
        );
      }

      let result = "";

      // For specific guardrail codes, extract just that guardrail
      if (/^[A-Z]+-\d+[a-z]?$/i.test(section_name)) {
        const guardrailPattern = new RegExp(
          `${section_name.toUpperCase()}[a-z]?\\s+\\([^)]+\\)\\s+[^\\n]+`,
          "gi"
        );
        for (const match of matches) {
          const guardrailMatches = match.content.match(guardrailPattern);
          if (guardrailMatches) {
            result += `## Found in: ${match.title}\n\n`;
            for (const g of guardrailMatches) {
              result += `${g}\n\n`;
            }
          }
        }
        if (result) return createTextResult(result);
      }

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
