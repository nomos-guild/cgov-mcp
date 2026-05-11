// Curated registry of Cardano treasury-funded entities.
//
// Mirrors `cgov/src/lib/treasuryEntities.ts` (see that file for evidence /
// per-proposal mappings). Kept in sync manually — the frontend file is the
// source of truth. We only need {entityId, label, aliases} here, not the
// proposal map, because cgov-mcp's job is just answering "which entity does
// the user mean?" and returning the canonical URL.
//
// When you add an entity to the frontend registry, add it here too.

export interface TreasuryEntity {
  entityId: string;
  label: string;
  aliases?: string[];
}

export const TREASURY_ENTITIES: readonly TreasuryEntity[] = [
  { entityId: "intersect", label: "Intersect", aliases: ["IntersectMBO", "Intersect MBO"] },
  { entityId: "input-output", label: "Input Output", aliases: ["IOG", "IOHK", "Input Output Global"] },
  { entityId: "cardano-foundation", label: "Cardano Foundation", aliases: ["CF"] },
  { entityId: "emurgo", label: "EMURGO" },
  { entityId: "mlabs", label: "MLabs" },
  { entityId: "txpipe", label: "TxPipe" },
  { entityId: "anastasia-labs", label: "Anastasia Labs" },
  { entityId: "vacuumlabs", label: "Vacuumlabs" },
  { entityId: "tweag", label: "Tweag" },
  { entityId: "harmonic-labs", label: "Harmonic Labs" },
  { entityId: "snek-foundation", label: "Snek Foundation", aliases: ["Snek"] },
  { entityId: "pragma", label: "PRAGMA (Amaru)", aliases: ["Amaru", "PRAGMA"] },
  { entityId: "eryx", label: "Eryx Coop", aliases: ["Eryx"] },
  { entityId: "socious", label: "Socious" },
  { entityId: "maestro", label: "Maestro" },
  { entityId: "flowdesk", label: "Flowdesk" },
  { entityId: "nftcdn", label: "NFTCDN" },
  { entityId: "eternl", label: "Eternl" },
  { entityId: "adastat", label: "AdaStat" },
  { entityId: "cexplorer", label: "Cexplorer" },
  { entityId: "bloxbean", label: "BloxBean" },
  { entityId: "scalus", label: "Scalus" },
  { entityId: "opshin", label: "OpShin" },
  { entityId: "pycardano", label: "PyCardano" },
  { entityId: "zkfold", label: "zkFold" },
  { entityId: "anzens", label: "Anzens / USDA", aliases: ["Anzens", "USDA"] },
  { entityId: "supplyoneers", label: "Supplyoneers FZ-LLC", aliases: ["Supplyoneers"] },
  { entityId: "haus", label: "Haus" },
  { entityId: "cardano-builder-dao", label: "Cardano Builder DAO (Clarity)", aliases: ["Clarity", "Builder DAO"] },
  { entityId: "draper-dragon", label: "Draper Dragon (Orion Fund)", aliases: ["Draper Dragon", "Orion Fund", "Orion"] },
  { entityId: "blink-labs", label: "Blink Labs" },
  { entityId: "defi-liquidity-committee", label: "Stablecoin DeFi Liquidity Interim Committee", aliases: ["DeFi Liquidity Committee", "Stablecoin Committee"] },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface TreasuryEntityMatch {
  entity: TreasuryEntity;
  matchedOn: "entityId" | "label" | "alias" | "partial";
  score: number;
}

// Score: exact-id > exact-label > exact-alias > prefix-label > substring (in label or alias).
// Returns top `limit` matches, deterministic order.
export function searchTreasuryEntities(
  query: string,
  limit = 10
): TreasuryEntityMatch[] {
  const q = normalize(query);
  if (q.length === 0) return [];

  const matches: TreasuryEntityMatch[] = [];
  for (const entity of TREASURY_ENTITIES) {
    const id = normalize(entity.entityId);
    const label = normalize(entity.label);
    const aliases = (entity.aliases ?? []).map(normalize);

    if (id === q) {
      matches.push({ entity, matchedOn: "entityId", score: 100 });
      continue;
    }
    if (label === q) {
      matches.push({ entity, matchedOn: "label", score: 95 });
      continue;
    }
    if (aliases.includes(q)) {
      matches.push({ entity, matchedOn: "alias", score: 90 });
      continue;
    }
    if (label.startsWith(q) || aliases.some((a) => a.startsWith(q))) {
      matches.push({ entity, matchedOn: "partial", score: 70 });
      continue;
    }
    if (label.includes(q) || aliases.some((a) => a.includes(q)) || id.includes(q)) {
      matches.push({ entity, matchedOn: "partial", score: 50 });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
