# Implementation Plan: DRep Voting Rationale Indexing

## Overview

Add voting rationale indexing capability to cgov-mcp to enable analysis of DRep voting appetite based on their stated reasoning.

### Current State
- `OnchainVote` table stores `anchorUrl` and `anchorHash` (pointers to rationale)
- ~30% of votes (5,806/19,115) have rationale URLs
- Rationale content stored externally on IPFS/GitHub as JSON-LD (CIP-100/CIP-119)
- **No rationale content is currently indexed**

### Goal
- Fetch and store rationale content from external sources
- Parse JSON-LD format to extract meaningful fields
- Enable full-text search on rationale content
- Expose via new MCP tools for querying

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        cgov-mcp                              │
├─────────────────────────────────────────────────────────────┤
│  New Components:                                             │
│  ├── src/services/rationaleIndexer.ts  (fetch + parse)      │
│  ├── src/services/ipfsGateway.ts       (IPFS resolution)    │
│  ├── src/tools/rationale.ts            (MCP query tools)    │
│  └── src/migrations/001_rationale.sql  (schema migration)   │
├─────────────────────────────────────────────────────────────┤
│  Existing:                                                   │
│  ├── src/db/index.ts                   (PostgreSQL pool)    │
│  ├── src/tools/query.ts                (generic SQL)        │
│  └── src/server.ts                     (MCP server)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
├─────────────────────────────────────────────────────────────┤
│  New Table: VoteRationale                                    │
│  ├── id, voteId, anchorUrl, anchorHash                      │
│  ├── summary, comment, rationaleText (parsed content)       │
│  ├── rawJson (original JSON-LD)                             │
│  ├── fetchStatus, fetchedAt                                 │
│  └── Full-text search index on rationaleText                │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Database Schema Migration

**File:** `src/migrations/001_vote_rationale.sql`

```sql
-- VoteRationale table for storing parsed rationale content
CREATE TABLE IF NOT EXISTS "VoteRationale" (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "voteId"        TEXT NOT NULL REFERENCES "OnchainVote"(id),
    "anchorUrl"     TEXT NOT NULL,
    "anchorHash"    TEXT,

    -- Parsed content from CIP-100/CIP-119 JSON-LD
    summary         TEXT,           -- @context.body.summary or title
    comment         TEXT,           -- @context.body.comment (main rationale)
    "rationaleText" TEXT,           -- Combined searchable text

    -- Metadata
    "rawJson"       JSONB,          -- Original JSON-LD for reference
    "fetchStatus"   TEXT DEFAULT 'pending',  -- pending, success, failed, unreachable
    "fetchError"    TEXT,           -- Error message if failed
    "fetchedAt"     TIMESTAMP,
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP,

    UNIQUE("voteId")
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_rationale_fts
ON "VoteRationale" USING gin(to_tsvector('english', "rationaleText"));

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_rationale_status ON "VoteRationale"("fetchStatus");

-- Index for joining with votes
CREATE INDEX IF NOT EXISTS idx_rationale_vote_id ON "VoteRationale"("voteId");
```

**Migration runner:** `src/db/migrate.ts`

---

### Step 2: IPFS Gateway Service

**File:** `src/services/ipfsGateway.ts`

Handles resolution of various IPFS URL formats:
- `ipfs://Qm...` → Public gateway
- `ipfs://bafk...` (CIDv1) → Public gateway
- `https://...ipfs.com/ipfs/...` → Direct fetch
- `https://raw.githubusercontent.com/...` → Direct fetch

**IPFS Gateways to use (with fallback):**
1. `https://ipfs.io/ipfs/`
2. `https://cloudflare-ipfs.com/ipfs/`
3. `https://dweb.link/ipfs/`

---

### Step 3: Rationale Indexer Service

**File:** `src/services/rationaleIndexer.ts`

```typescript
interface RationaleIndexer {
  // Index all pending rationales (batch mode)
  indexPendingRationales(batchSize?: number): Promise<IndexResult>;

  // Index specific vote's rationale (on-demand)
  indexVoteRationale(voteId: string): Promise<VoteRationale | null>;

  // Parse CIP-100/CIP-119 JSON-LD
  parseRationaleJsonLd(json: unknown): ParsedRationale;
}
```

**CIP-100/CIP-119 JSON-LD Structure:**
```json
{
  "@context": { ... },
  "hashAlgorithm": "blake2b-256",
  "body": {
    "comment": "The main rationale text...",
    "externalUpdates": [...]
  }
}
```

**Extraction logic:**
- `comment` → Primary rationale text
- `summary` → If present, brief summary
- Combine into `rationaleText` for full-text search

---

### Step 4: New MCP Tools

**File:** `src/tools/rationale.ts`

#### Tool 1: `fetch_vote_rationale`
```typescript
{
  name: "fetch_vote_rationale",
  description: "Fetch and parse rationale for a specific vote by vote ID",
  inputSchema: {
    properties: {
      voteId: { type: "string" }
    }
  }
}
```

#### Tool 2: `search_rationales`
```typescript
{
  name: "search_rationales",
  description: "Full-text search across all indexed rationales",
  inputSchema: {
    properties: {
      query: { type: "string", description: "Search terms" },
      drepId: { type: "string", description: "Filter by DRep (optional)" },
      vote: { type: "string", enum: ["YES", "NO", "ABSTAIN"], description: "Filter by vote type" },
      limit: { type: "number", default: 20 }
    }
  }
}
```

#### Tool 3: `get_drep_rationales`
```typescript
{
  name: "get_drep_rationales",
  description: "Get all rationales for a specific DRep with their votes",
  inputSchema: {
    properties: {
      drepId: { type: "string" },
      proposalType: { type: "string", description: "Filter by governance action type" },
      limit: { type: "number", default: 50 }
    }
  }
}
```

#### Tool 4: `index_pending_rationales`
```typescript
{
  name: "index_pending_rationales",
  description: "Trigger batch indexing of unprocessed rationales",
  inputSchema: {
    properties: {
      batchSize: { type: "number", default: 100 }
    }
  }
}
```

#### Tool 5: `get_rationale_stats`
```typescript
{
  name: "get_rationale_stats",
  description: "Get statistics on rationale indexing coverage",
  inputSchema: { properties: {} }
}
```

---

### Step 5: Update Tool Registry

**File:** `src/tools/index.ts`

Add new rationale tools to the registry:
```typescript
import {
  fetchVoteRationale,
  searchRationales,
  getDrepRationales,
  indexPendingRationales,
  getRationaleStats
} from "./rationale.js";

export const tools: ToolHandler[] = [
  // Existing
  queryDatabase,
  listTables,
  describeTable,
  // New rationale tools
  fetchVoteRationale,
  searchRationales,
  getDrepRationales,
  indexPendingRationales,
  getRationaleStats,
];
```

---

### Step 6: Database Write Capability

**File:** `src/db/index.ts`

Add a separate connection for write operations (rationale indexing only):
```typescript
export async function writeQuery<T>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  // No READ ONLY restriction for rationale writes
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/migrations/001_vote_rationale.sql` | Create | Schema migration for VoteRationale table |
| `src/db/migrate.ts` | Create | Migration runner utility |
| `src/db/index.ts` | Modify | Add write capability for rationale indexing |
| `src/services/ipfsGateway.ts` | Create | IPFS URL resolution and fetching |
| `src/services/rationaleIndexer.ts` | Create | Core indexing and parsing logic |
| `src/tools/rationale.ts` | Create | 5 new MCP tools for rationale queries |
| `src/tools/index.ts` | Modify | Register new rationale tools |
| `package.json` | Modify | Add axios dependency for HTTP fetching |

---

## Dependencies to Add

```json
{
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

---

## Usage Examples

### Example 1: Search for budget-related concerns
```
Tool: search_rationales
Input: { "query": "budget too large expensive", "vote": "NO" }
```

### Example 2: Get a DRep's voting rationales
```
Tool: get_drep_rationales
Input: { "drepId": "drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w" }
```

### Example 3: Understand why votes were cast on treasury proposals
```
Tool: search_rationales
Input: { "query": "treasury withdrawal security audit", "proposalType": "TREASURY_WITHDRAWALS" }
```

---

## Testing Plan

1. **Unit tests** for JSON-LD parsing (various CIP-100/119 formats)
2. **Integration tests** for IPFS gateway resolution
3. **E2E tests** for full indexing pipeline
4. **Manual testing** with real rationale URLs from database

---

## Rollout Steps

1. Run migration to create VoteRationale table
2. Deploy updated cgov-mcp with new tools
3. Trigger initial batch indexing via `index_pending_rationales`
4. Monitor indexing progress via `get_rationale_stats`
5. Test search functionality with real queries

---

## Future Enhancements (Out of Scope)

- AI-powered concern extraction (themes, sentiment)
- Scheduled background indexer (cron job)
- Rationale similarity scoring
- DRep appetite prediction model
