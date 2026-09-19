import { canRead } from "./public-policy.mjs";

// Use the durable revision log: changes made by background worker processes
// must survive disconnects, not just changes observed in this server process.
export function changesSince(store, cursor) {
  const revision = store.sequence;
  const since = typeof cursor === "string" && /^\d+$/.test(cursor) ? Number(cursor) : NaN;
  if (!Number.isSafeInteger(since) || since > revision) return { revision };
  if (since < Number(store.getControl("derivedPrunedThrough") || 0)) return { revision };
  const collections = store.database.prepare(
    "SELECT DISTINCT collection_path FROM revisions WHERE seq>? AND seq<=?",
  ).all(since, revision).map(row => row.collection_path).filter(p => canRead(p, true));
  return { revision, collections };
}

export const eventFrame = update => `id: ${update.revision}\ndata: ${JSON.stringify(update)}\n\n`;
