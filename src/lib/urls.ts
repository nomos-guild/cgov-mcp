// Canonical app.cgov.io URL builders.
//
// Every entity-returning tool must populate the `url` field on each row using
// one of these. The agent is told (via server instructions) to cite this URL
// verbatim — never construct one from an ID — so that fabricated URLs become
// impossible by construction.

const APP_BASE =
  process.env.CGOV_APP_BASE_URL?.replace(/\/$/, "") || "https://app.cgov.io";

export function drepUrl(drepId: string | null | undefined): string | null {
  if (!drepId) return null;
  return `${APP_BASE}/drep/${encodeURIComponent(drepId)}`;
}

// Proposal pages accept either the bech32 `gov_action1…` proposalId or the
// `txHash:certIndex` hash — `/governance/[hash].tsx` treats them as equivalent.
// The cgov-mcp DB column is `proposal_id` (gov_action1… form).
export function proposalUrl(proposalId: string | null | undefined): string | null {
  if (!proposalId) return null;
  return `${APP_BASE}/governance/${encodeURIComponent(proposalId)}`;
}

export function treasuryEntityUrl(entityId: string | null | undefined): string | null {
  if (!entityId) return null;
  return `${APP_BASE}/treasury/${encodeURIComponent(entityId)}`;
}
