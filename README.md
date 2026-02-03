# cgov-mcp

A Model Context Protocol (MCP) server that provides read-only access to Cardano governance data via PostgreSQL.

## Overview

This MCP server enables AI assistants like Claude to query Cardano governance data including:

- **DReps** (Delegated Representatives) - voting power, profiles
- **Proposals** - governance actions, status, vote tallies
- **Votes** - on-chain voting records with rationale URLs
- **SPOs** (Stake Pool Operators) and **CC** (Constitutional Committee) members

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cgov
DB_USER=postgres
DB_PASSWORD=postgres

# Server
TRANSPORT_MODE=http  # or "stdio" for Claude Desktop
PORT=3000
HOST=0.0.0.0
```

## Usage

### HTTP Mode (Default)

```bash
npm start
```

The server runs on `http://localhost:3000` with endpoints:

- `POST /mcp` - MCP protocol endpoint
- `GET /health` - Health check

#### Claude Desktop Configuration (HTTP)

With the server running, add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "cgov-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Stdio Mode (Alternative)

Use this if you want Claude Desktop to spawn and manage the server process directly (no separate `npm start` needed).

Set `TRANSPORT_MODE=stdio` in `.env`, then configure Claude Desktop:

```json
{
  "mcpServers": {
    "cgov-mcp": {
      "command": "node",
      "args": ["/path/to/cgov-mcp/dist/index.js"],
      "env": {
        "TRANSPORT_MODE": "stdio",
        "DB_HOST": "localhost",
        "DB_NAME": "cgov",
        "DB_USER": "postgres",
        "DB_PASSWORD": "postgres"
      }
    }
  }
}
```

## Available Tools

| Tool                       | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `query_database`           | Execute read-only SQL queries                             |
| `list_tables`              | List all database tables                                  |
| `describe_table`           | Get table schema/structure                                |
| `search_constitution`      | Search the Cardano Constitution for relevant text         |
| `get_constitution_section` | Get a specific section of the Constitution by name        |
| `search_vision_2030`       | Search the Cardano Vision 2030 Strategic Framework        |
| `get_vision_section`       | Get a specific section of the Vision 2030 document        |
| `get_vision_kpis`          | Get Vision 2030 KPIs and targets                          |
| `search_voting_rationale`  | Search voting rationales by keywords                      |
| `get_vote_rationale`       | Get full rationale for a specific vote                    |
| `get_drep_voting_history`  | Get DRep voting history with rationales                   |
| `get_proposal_rationales`  | Get all rationales for a specific proposal                |
| `get_rationale_stats`      | Get statistics on rationale coverage                      |

## Voting Rationale Tools

The voting rationale tools provide access to on-chain voting data with CIP-100/CIP-136 structured rationales:

```text
# Search for rationales containing specific keywords
search_voting_rationale(query="constitutional")

# Filter by vote type and voter type
search_voting_rationale(query="treasury", vote_filter="NO", voter_type="DREP")

# Get full rationale for a specific vote
get_vote_rationale(vote_id="abc123...")

# Get rationale by DRep + proposal combination
get_vote_rationale(drep_id="drep1...", proposal_id="gov_action1...")

# Get a DRep's voting history with rationales
get_drep_voting_history(drep_id="drep1...")

# Filter by governance action type
get_drep_voting_history(drep_id="drep1...", governance_action_type="TREASURY_WITHDRAWALS")

# Get all rationales for a proposal grouped by vote choice
get_proposal_rationales(proposal_id="gov_action1...")

# Get rationale coverage statistics
get_rationale_stats()
get_rationale_stats(governance_action_type="INFO_ACTION")
```

### Rationale JSON Structure (CIP-136)

Rationales are stored in CIP-100/CIP-136 JSON format containing:
- `body.summary` - Brief summary of the vote reasoning
- `body.rationaleStatement` - Detailed rationale
- `body.conclusion` - Final conclusion
- `body.precedentDiscussion` - Discussion of relevant precedents
- `body.counterargumentDiscussion` - Acknowledgment of counterarguments
- `body.internalVote` - Internal vote breakdown (for CC votes)
- `body.references` - Links to relevant articles and documents
- `authors` - Who authored the rationale

## Vision 2030 Search Examples

The Cardano Vision 2030 Strategic Framework outlines the path to making Cardano "The World's Operating System":

```text
# Search for specific topics
search_vision_2030(query="TVL target")

# Get a specific pillar
get_vision_section(section_name="Pillar 3")

# Get all KPIs
get_vision_kpis()

# Filter KPIs by category
get_vision_kpis(category="Governance")

# Search within a specific pillar
search_vision_2030(query="DeFi", pillar="Adoption")
```

## Constitution Search Examples

The Cardano Constitution contains governance rules, tenets, and guardrails. Use the constitution tools to search and retrieve specific provisions:

```text
# Search for treasury-related provisions
search_constitution(query="treasury withdrawal")

# Get a specific article
get_constitution_section(section_name="Article VII")

# Find a specific tenet
get_constitution_section(section_name="Tenet 5")

# Look up a guardrail code
get_constitution_section(section_name="TREASURY-01a")

# Search with full section output
search_constitution(query="DRep voting threshold", include_full_sections=true)
```

## Example SQL Queries

```sql
-- Get top 10 DReps by voting power
SELECT name, "votingPower" FROM "Drep" ORDER BY "votingPower" DESC LIMIT 10;

-- Get voting history for a DRep
SELECT v.vote, p.title, p."governanceActionType"
FROM "OnchainVote" v
JOIN "Proposal" p ON v."proposalId" = p."proposalId"
WHERE v."drepId" = 'drep1...'
ORDER BY v."votedAt" DESC;

-- Get vote distribution summary
SELECT vote, COUNT(*) FROM "OnchainVote" GROUP BY vote;
```

## Database Schema

### Core Tables

- `Drep` - DRep profiles and voting power
- `Proposal` - Governance proposals and metadata
- `OnchainVote` - Voting records with rationale URLs
- `SPO` - Stake pool operators
- `CC` - Constitutional committee members

## Development

```bash
npm run dev    # Watch mode for TypeScript
npm run build  # Compile TypeScript
npm run clean  # Remove dist folder
```

## License

Apache-2.0
