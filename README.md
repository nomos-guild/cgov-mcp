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

| Tool             | Description                   |
| ---------------- | ----------------------------- |
| `query_database` | Execute read-only SQL queries |
| `list_tables`    | List all database tables      |
| `describe_table` | Get table schema/structure    |

## Example Queries

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

ISC
