// Curated proposalId → treasury-entity mapping.
//
// Mirrors `cgov/src/lib/treasuryEntities.ts` (PROPOSAL_ENTITY_MAP + ENTITY_KEYWORDS).
// The frontend file is the source of truth — add new mappings there first, then
// reflect here. The CI drift check in cgov-mcp watches for divergence.
//
// We intentionally drop the per-proposal `evidence` audit-trail strings the
// frontend stores: the LLM can re-derive justification from the proposal's
// description/rationale text (which is in the cgov-mcp DB anyway).

import {
  searchTreasuryEntities,
  TREASURY_ENTITIES,
  type TreasuryEntity,
} from "./treasury-entities.js";
import { treasuryEntityUrl } from "./urls.js";

// Curated mappings: proposal_id (bech32 gov_action1…) → entityId.
// Both 2025 and 2026 collapsed into one flat map — cgov-mcp doesn't need
// per-year bucketing (only the frontend chart does).
const CURATED: Record<string, string> = {
  // ── 2025 ────────────────────────────────────────────────────────────────
  "gov_action1lqun78lcznfa2gek49m3ydslakfnm8heargfp8sax9fk54yl6ghsqp042zv": "intersect",
  "gov_action1q0m8z7glm9cprucwf44hdjdfra8khnakpm3hu5ueh929hvljw4aqqzuxfxz": "snek-foundation",
  "gov_action16tdkp3fs0j6303e4utgp8rftdug0ckezr4sslgv8wxdaeq40ngpsq5sr06h": "intersect",
  "gov_action1fl6r784t2ffw7q96du2znhprw90r3xvrfugvqelgqewgxex42kdqq9tgrd5": "snek-foundation",
  "gov_action1r44w54hx553mz0sr4cc07f8tlxzj2sa57l2pt3l9pa2ldw42fc7sq5q3rtn": "snek-foundation",
  "gov_action18nefry4qacd80xzs2srjahxm2e4vz3c8wvrr03rrtk8mdqfuknysq66459t": "mlabs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqyxzxz7k": "input-output", // Blockfrost (IO subsidiary)
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpwywvhcq": "input-output",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlzgf074ea": "mlabs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlzyc3clg6": "pycardano",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlzzy7m65d": "opshin",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlzqhm6e8q": "input-output",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlp730y0dn": "anzens",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpsn5rx0e": "cardano-foundation",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlp2tyw3h6": "intersect",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpgcp0jyh": "adastat",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpz4s2af8": "scalus",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpqx4t762": "eternl",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlq77jt4x4": "eryx",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqudh2k4c": "tweag",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlq63cfnf0": "mlabs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqczags6z": "harmonic-labs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqkqx0ecg": "intersect",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlq5nrw6t9": "maestro",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqj0vdlhj": "vacuumlabs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqsufvuyl": "txpipe",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqwtnrdnx": "zkfold",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqvckzwqt": "anastasia-labs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlq2yeptuu": "txpipe",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqghuqg03": "txpipe",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlzxt5eumh": "intersect",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlp679xfzf": "supplyoneers",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpcdq823y": "flowdesk",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlp5u7pqqr": "cardano-builder-dao",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpjq3z9u5": "cardano-foundation",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpuz29v77": "haus",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpk0mqrnw": "socious",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpvhtd5td": "input-output",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpx66gmxa": "nftcdn",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqx488pdm": "vacuumlabs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqz6d98zp": "input-output",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlqqfgyy3v": "anastasia-labs",
  "gov_action13tfag48nf94rtjcdq7c06vhkslmxxw9h6c88sl7q5g5nnewcsvlpyflfc4s": "cexplorer",
  "gov_action193leqzml768nz7nmpepzx822a5mzyanqhtewaxjtul5gp6uhwvfsqgl2qg0": "bloxbean",
  "gov_action1vrkk4dpuss8l3z9g4uc2rmf8ks0f7j534zvz9v4k85dlc54wa3zsqq68rx0": "pragma",

  // ── 2026 ────────────────────────────────────────────────────────────────
  "gov_action13qr78nhrhetywapvx2wpm63y9uxpc2dc45zsu9gkncasxqhuhltqqqfu32x": "draper-dragon",
  "gov_action17dfgtkeufcy945e3ssanqpmn09ft3gezhvepvvg7msmlmaz260dqqjtsmpe": "blink-labs",
  "gov_action1uhzd06a26qavzflvrx3gvcz6rzxkl6su2ns8t3seef5e8dl6nlgsqcgtufg": "defi-liquidity-committee",
  "gov_action19uhuy5uame2s60yrh6n8cyds8ps5q7tkh05dqlzmpcfy429p9w4qq5ll3g0": "pragma",
  "gov_action1fvgw27fjpr9c7g582mszzyez0jgkqgjgatzdnyngrg8wwc9kcn3qqxtz8r7": "defi-liquidity-committee",
  "gov_action1hkgl5l4fknsf7aktmcatkz6kfl7xpvn7rzh5vnxwexl0n3cc6zrsqt5459v": "cardano-foundation",
  "gov_action1w0shrfxqwv95kk0v4cn34wylz25a2cmqkq5jpc0e2yrahhqava3qsuae57l": "input-output",
  "gov_action1w0shrfxqwv95kk0v4cn34wylz25a2cmqkq5jpc0e2yrahhqava3qwt8k9fx": "input-output",
  "gov_action10dp9wzmgt2nqshyrghufff4sfhcxedhmzluly5k0azguatnsthwqqs84cjf": "cardano-foundation",
  "gov_action18u8lpkzge2csxe3plynn9lh4agwtv3nrqkyfwalwj4ykjv7l68jqqzmul9z": "emurgo",
  "gov_action1kj6ghzuz9wcq88f3y72cyyeekdcemlq0dqk4zpjd4eck5assuypqq0pckkw": "emurgo",
  "gov_action1guz68e8zkwphcdc8wnp40cclkv92qgnel7xnffmsmp2ljp09qtwqq596k4c": "harmonic-labs",
  "gov_action1ggr2uz7prwn5l84cdn2krwngfez0p7wluy4u3u3ez9pz5ls2whesqnsjly8": "harmonic-labs",
};

// Title-keyword fallback for proposals that aren't (yet) in the curated map.
// Mirrors ENTITY_KEYWORDS in cgov frontend. Word-boundary matching keeps short
// tokens like "iog" from matching inside unrelated words.
const ENTITY_KEYWORDS: Record<string, readonly string[]> = {
  intersect: ["intersect"],
  "input-output": [
    "io", "input output", "input-output", "input | output",
    "iohk", "iog", "ior", "ioe",
    "input output global", "input output research", "input output engineering",
    "blockfrost", // Blockfrost is an IO subsidiary
  ],
  "cardano-foundation": ["cardano foundation"],
  emurgo: ["emurgo"],
  mlabs: ["mlabs"],
  txpipe: ["txpipe"],
  "anastasia-labs": ["anastasia labs"],
  vacuumlabs: ["vacuumlabs", "vacuum labs"],
  tweag: ["tweag"],
  "harmonic-labs": ["harmonic labs", "hlabs", "gerolamo"],
  "snek-foundation": ["snek foundation"],
  pragma: ["pragma", "amaru treasury"],
  eryx: ["eryx"],
  socious: ["socious"],
  maestro: ["maestro"],
  flowdesk: ["flowdesk"],
  nftcdn: ["nftcdn"],
  eternl: ["eternl"],
  adastat: ["adastat"],
  cexplorer: ["cexplorer"],
  bloxbean: ["bloxbean"],
  scalus: ["scalus"],
  opshin: ["opshin"],
  pycardano: ["pycardano"],
  zkfold: ["zkfold"],
  anzens: ["anzens"],
  supplyoneers: ["supplyoneers"],
  "cardano-builder-dao": ["cardano builder dao"],
  "draper-dragon": ["draper dragon", "orion fund"],
  "blink-labs": ["blink labs"],
  "defi-liquidity-committee": ["defi liquidity", "stablecoin defi liquidity"],
  // "haus" deliberately omitted — too short/generic, prone to false positives.
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferEntityIdFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (const [entityId, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    for (const k of keywords) {
      const re = new RegExp(`\\b${escapeRegex(k)}\\b`);
      if (re.test(lower)) return entityId;
    }
  }
  return null;
}

export interface FundingEntity {
  entity_id: string;
  label: string;
  url: string | null;
  source: "curated" | "heuristic";
}

// Resolve a treasury-withdrawal proposal to its funding entity. Curated map
// wins; otherwise fall back to the title keyword heuristic. Returns null when
// neither yields a match (the frontend would show "unknown" / unclassified).
// Callers should pass through non-treasury actions without calling this.
export function resolveFundingEntity(
  proposalId: string | null | undefined,
  title: string | null | undefined,
  governanceActionType: string | null | undefined
): FundingEntity | null {
  if (governanceActionType !== "TREASURY_WITHDRAWALS") return null;

  let entityId: string | null = null;
  let source: "curated" | "heuristic" = "curated";

  if (proposalId && CURATED[proposalId]) {
    entityId = CURATED[proposalId];
  } else {
    const inferred = inferEntityIdFromTitle(title);
    if (inferred) {
      entityId = inferred;
      source = "heuristic";
    }
  }

  if (!entityId) return null;

  const entity = TREASURY_ENTITIES.find((e) => e.entityId === entityId);
  return {
    entity_id: entityId,
    label: entity?.label ?? entityId,
    url: treasuryEntityUrl(entityId),
    source,
  };
}

// Reverse lookup: every curated proposal funded by `entityId`. Title-heuristic
// matches are NOT included — we'd need every proposal's title to do that, and
// the heuristic is meant as a fallback for unknown proposals, not a bulk index.
export function getProposalsByEntity(entityId: string): string[] {
  return Object.entries(CURATED)
    .filter(([, eid]) => eid === entityId)
    .map(([proposalId]) => proposalId);
}

// Re-export for tools/treasury.ts that does entity-name resolution
export { searchTreasuryEntities, type TreasuryEntity };
