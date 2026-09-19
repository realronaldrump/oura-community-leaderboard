// Only reproducible projections are collectible. Source readings, profile data,
// credentials, webhook inboxes, migration archives and backups are never touched.
export const DERIVED_COLLECTIONS = ["recordPages", "recordDays", "recordIndexes", "metricMonths"];
export const DERIVED_GRACE_MS = 15 * 60 * 1000; // Public snapshot cursors expire after 5 minutes.

export function pruneDerivedRecords(store, { now = new Date(), batchSize = 2000 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2000) throw new Error("invalid_cleanup_batch_size");
  const cutoff = new Date(now.getTime() - DERIVED_GRACE_MS).toISOString();
  const db = store.database;
  const keep = new Set();
  const get = db.prepare("SELECT payload FROM documents WHERE path=? AND deleted=0");
  const read = path => {
    const row = get.get(path);
    if (!row) throw new Error("missing_derived_reference");
    return JSON.parse(row.payload);
  };
  const reference = (root, collection, id) => {
    if (typeof id !== "string" || !id || id.includes("/")) throw new Error("invalid_derived_reference");
    const path = `${root}/${collection}/${id}`;
    if (keep.has(path)) return null;
    keep.add(path);
    return path;
  };
  const retainMonths = (root, months) => {
    for (const id of Object.values(months || {})) reference(root, "metricMonths", id);
  };
  const retainSnapshot = (root, value) => {
    if (!value) return;
    retainMonths(root, value.months);
    for (const [peer, input] of Object.entries(value.peerInputs || {})) {
      if (peer.includes("/")) throw new Error("invalid_derived_reference");
      retainMonths(`profileStats/${peer}`, input.months);
    }
    if (!value.archiveIndex) return; // An unpublished metric-month draft.
    const indexPath = reference(root, "recordIndexes", value.archiveIndex);
    if (!indexPath) return;
    const index = read(indexPath);
    for (const id of Object.values(index.days || {})) {
      const dayPath = reference(root, "recordDays", id);
      if (!dayPath) continue;
      for (const page of read(dayPath).pages || []) reference(root, "recordPages", page);
    }
  };
  let scanned = 0, retired = 0, removed = 0, revisionsRemoved = 0;
  const revisions = db.prepare("SELECT seq,payload,deleted,recorded_at FROM revisions WHERE path=? ORDER BY seq DESC");
  const rootBaselines = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    let prunedThrough = Number(store.getControl("derivedPrunedThrough") || 0);
    const profiles = db.prepare("SELECT document_id FROM documents WHERE collection_path='profiles' AND deleted=0 ORDER BY document_id").all();
    const collections = [];
    for (const { document_id: id } of profiles) {
      const root = `profileStats/${id}`;
      for (const name of DERIVED_COLLECTIONS) collections.push(`${root}/${name}`);
      for (const name of ["insights", "insights-draft"]) {
        const path = `${root}/snapshots/${name}`;
        const current = get.get(path);
        if (current) retainSnapshot(root, JSON.parse(current.payload));
        // Include the snapshot that was current at the start of the grace
        // window, even if it was originally published months earlier.
        for (const row of revisions.iterate(path)) {
          if (!row.deleted) retainSnapshot(root, JSON.parse(row.payload));
          if (row.recorded_at < cutoff) {
            rootBaselines.push({ path, seq: row.seq });
            break;
          }
        }
      }
    }
    const cursor = store.getControl("derivedCleanupCursor") || {};
    const index = Math.max(0, collections.indexOf(cursor.collection));
    const collection = collections[index];
    if (collection) {
      const after = collection === cursor.collection ? cursor.after || "" : "";
      const rows = db.prepare(`SELECT d.path,d.document_id,d.deleted,r.recorded_at FROM documents d
        JOIN revisions r ON r.seq=d.version
        WHERE d.collection_path=? AND d.document_id>? ORDER BY d.document_id LIMIT ?`).all(collection, after, batchSize);
      const maxRevision = db.prepare("SELECT MAX(seq) AS seq,COUNT(*) AS n FROM revisions WHERE path=?");
      const deleteRevisions = db.prepare("DELETE FROM revisions WHERE path=?");
      const deleteDocument = db.prepare("DELETE FROM documents WHERE path=?");
      const tombstone = db.prepare("INSERT INTO revisions(path,collection_path,document_id,payload,deleted,recorded_at,reason) VALUES(?,?,?,NULL,1,?,'derived_retired')");
      const retire = db.prepare("UPDATE documents SET payload=NULL,deleted=1,version=? WHERE path=?");
      for (const row of rows) {
        scanned++;
        if (row.recorded_at >= cutoff || keep.has(row.path)) continue;
        if (!row.deleted) {
          // First retire through the normal versioned-read model. Even a
          // client paginating an entire collection can finish its old cursor.
          const version = tombstone.run(row.path, collection, row.document_id, now.toISOString()).lastInsertRowid;
          retire.run(version, row.path);
          retired++;
          continue;
        }
        const info = maxRevision.get(row.path);
        prunedThrough = Math.max(prunedThrough, Number(info.seq));
        revisionsRemoved += Number(info.n);
        deleteRevisions.run(row.path);
        deleteDocument.run(row.path);
        removed++;
      }
      store.setControl("derivedCleanupCursor", rows.length === batchSize
        ? { collection, after: rows.at(-1).document_id }
        : { collection: collections[(index + 1) % collections.length], after: "" });
    }
    // Bound historical copies of the mutable derived roots as well. Preserve
    // their grace-window baseline so consistent multi-request reads still work.
    let rootBudget = Math.min(100, batchSize);
    for (const { path, seq } of rootBaselines) {
      const rows = db.prepare("SELECT seq FROM revisions WHERE path=? AND seq<? ORDER BY seq LIMIT ?").all(path, seq, rootBudget);
      const remove = db.prepare("DELETE FROM revisions WHERE seq=?");
      for (const row of rows) {
        prunedThrough = Math.max(prunedThrough, Number(row.seq));
        remove.run(row.seq);
        revisionsRemoved++;
        rootBudget--;
      }
    }
    store.setControl("derivedPrunedThrough", prunedThrough);
    db.exec("COMMIT");
    return { scanned, retired, removed, revisionsRemoved };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* SQLite may already have rolled back. */ }
    throw error;
  }
}
