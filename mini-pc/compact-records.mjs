import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DERIVED_COLLECTIONS, DERIVED_GRACE_MS } from "./derived-records.mjs";

const quote = name => `"${name.replaceAll('"', '""')}"`;
const encodedRow = row => JSON.stringify(row, (_key, value) =>
  typeof value === "bigint" ? { integer: String(value) }
    : value instanceof Uint8Array ? { blob: Buffer.from(value).toString("base64") } : value);
const isProjection = collection => {
  const parts = collection.split("/");
  return parts.length === 3 && parts[0] === "profileStats" && DERIVED_COLLECTIONS.includes(parts[2]);
};

/** Offline copy-and-verify maintenance. Never replaces or removes the source.
 * All services/writers must have been stopped for the complete cursor grace.
 * Only obsolete, reproducible Records projections and their histories are omitted.
 */
export function compactRecords(store, { destination, quiescedAt, now = new Date(), onProgress = () => {} }) {
  const stoppedAt = new Date(quiescedAt).getTime();
  if (!Number.isFinite(stoppedAt) || now.getTime() - stoppedAt < DERIVED_GRACE_MS)
    throw new Error("compaction_requires_15_minutes_without_writers_or_readers");
  if (!destination || fs.existsSync(destination) || fs.existsSync(`${destination}.manifest.json`))
    throw new Error("compaction_destination_must_be_new");
  const source = store.database;
  const lastWrite = source.prepare("SELECT recorded_at FROM revisions ORDER BY seq DESC LIMIT 1").get();
  if (lastWrite && Date.parse(lastWrite.recorded_at) > stoppedAt)
    throw new Error("writes_after_compaction_quiescence");
  const capacity = () => {
    const disk = fs.statfsSync(path.dirname(destination));
    if (disk.bavail * disk.bsize < 5 * 1024 ** 3) throw new Error("insufficient_compaction_space");
  };
  capacity();
  const checkpoint = source.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  if (checkpoint.busy) throw new Error("compaction_source_has_active_readers");
  source.exec("BEGIN IMMEDIATE"); // Prevent writes for the entire verified copy.
  let target;
  let created = false;
  try {
    // Recheck after taking the writer lock: a racing writer must not evade the gate.
    const latest = source.prepare("SELECT recorded_at FROM revisions ORDER BY seq DESC LIMIT 1").get();
    if (latest && Date.parse(latest.recorded_at) > stoppedAt) throw new Error("writes_after_compaction_quiescence");
    const collections = {};
    for (const table of ["documents", "revisions"])
      collections[table] = source.prepare(`SELECT DISTINCT collection_path FROM ${table} ORDER BY collection_path`).all().map(r => r.collection_path);
    const keep = new Set();
    const get = source.prepare("SELECT payload FROM documents WHERE path=? AND deleted=0");
    const required = (root, collection, id) => {
      if (typeof id !== "string" || !id || id.includes("/")) throw new Error("invalid_compaction_reference");
      const key = `${root}/${collection}/${id}`;
      if (keep.has(key)) return null;
      const row = get.get(key);
      if (!row) throw new Error("missing_compaction_reference");
      keep.add(key);
      return JSON.parse(row.payload);
    };
    const months = (root, ids) => {
      for (const id of Object.values(ids || {})) required(root, "metricMonths", id);
    };
    for (const collection of collections.documents.filter(c => /^profileStats\/[^/]+\/snapshots$/.test(c))) {
      const root = collection.slice(0, -"/snapshots".length);
      for (const name of ["insights", "insights-draft"]) {
        const row = get.get(`${collection}/${name}`);
        if (!row) continue;
        const snapshot = JSON.parse(row.payload);
        months(root, snapshot.months);
        for (const [peer, input] of Object.entries(snapshot.peerInputs || {})) {
          if (peer.includes("/")) throw new Error("invalid_compaction_reference");
          months(`profileStats/${peer}`, input.months);
        }
        if (!snapshot.archiveIndex) continue;
        const index = required(root, "recordIndexes", snapshot.archiveIndex);
        if (!index) continue;
        for (const id of Object.values(index.days || {})) {
          const day = required(root, "recordDays", id);
          if (day) for (const page of day.pages || []) required(root, "recordPages", page);
        }
      }
    }
    const schema = source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = schema.filter(s => s.type === "table").sort((a, b) => {
      const rank = name => name === "documents" ? 0 : name === "revisions" ? 1 : 2;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });
    const columns = {};
    const order = {};
    for (const table of tables) {
      const info = source.prepare(`PRAGMA table_info(${quote(table.name)})`).all();
      columns[table.name] = info.map(c => c.name);
      const keys = info.filter(c => c.pk).sort((a, b) => a.pk - b.pk);
      order[table.name] = keys.length ? keys.map(c => quote(c.name)).join(",") : "rowid";
    }
    const keepByCollection = new Map();
    for (const key of [...keep].sort()) {
      const collection = key.slice(0, key.lastIndexOf("/"));
      if (!keepByCollection.has(collection)) keepByCollection.set(collection, []);
      keepByCollection.get(collection).push(key);
    }
    const prepared = (db, sql) => {
      const statement = db.prepare(sql);
      statement.setReadBigInts(true);
      return statement;
    };
    function* retainedRows(db, table) {
      if (!collections[table]) {
        yield* prepared(db, `SELECT * FROM ${quote(table)} ORDER BY ${order[table]}`).iterate();
        return;
      }
      for (const collection of collections[table]) {
        if (isProjection(collection)) {
          const statement = prepared(db, table === "documents"
            ? "SELECT * FROM documents WHERE path=?"
            : "SELECT r.* FROM revisions r JOIN documents d ON d.version=r.seq WHERE d.path=?");
          for (const key of keepByCollection.get(collection) || []) {
            const row = statement.get(key);
            if (!row) throw new Error("missing_compaction_revision");
            yield row;
          }
        } else {
          const derivedRoots = table === "revisions" && /^profileStats\/[^/]+\/snapshots$/.test(collection);
          const condition = derivedRoots
            ? " AND (document_id NOT IN ('insights','insights-draft') OR seq=(SELECT version FROM documents d WHERE d.path=revisions.path))" : "";
          yield* prepared(db, `SELECT * FROM ${table} WHERE collection_path=?${condition} ORDER BY ${table === "documents" ? "document_id" : "seq"}`).iterate(collection);
        }
      }
    }
    const fd = fs.openSync(destination, "wx", 0o600);
    fs.closeSync(fd);
    created = true;
    target = new DatabaseSync(destination);
    target.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA cache_size=-8192; BEGIN");
    for (const table of tables) target.exec(table.sql);
    const audits = {};
    let lastProgress = 0;
    const progress = (phase, table, count, force = false) => {
      if (force || Date.now() - lastProgress > 10000) {
        capacity();
        onProgress({ phase, table, rows: count, bytes: fs.statSync(destination).size });
        lastProgress = Date.now();
      }
    };
    for (const { name } of tables) {
      const insert = target.prepare(`INSERT INTO ${quote(name)} (${columns[name].map(quote).join(",")}) VALUES (${columns[name].map(() => "?").join(",")})`);
      const hash = crypto.createHash("sha256");
      let count = 0;
      for (const row of retainedRows(source, name)) {
        insert.run(...columns[name].map(c => row[c]));
        hash.update(encodedRow(row) + "\n");
        if (++count % 1000 === 0) progress("copy", name, count);
      }
      audits[name] = { rows: count, sha256: hash.digest("hex") };
      progress("copied", name, count, true);
    }
    // Explicitly retain the high-water marks, even where the largest revision
    // was an obsolete projection. Public cursors must never go backwards.
    target.exec("DELETE FROM sqlite_sequence");
    for (const row of prepared(source, "SELECT name,seq FROM sqlite_sequence").all())
      target.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)").run(row.name, row.seq);
    for (const object of schema.filter(s => s.type !== "table")) target.exec(object.sql);
    for (const pragma of ["user_version", "application_id"])
      target.exec(`PRAGMA ${pragma}=${Number(source.prepare(`PRAGMA ${pragma}`).get()[pragma])}`);
    target.exec("COMMIT");
    for (const { name } of tables) {
      const hash = crypto.createHash("sha256");
      let count = 0;
      for (const row of retainedRows(target, name)) {
        hash.update(encodedRow(row) + "\n");
        if (++count % 1000 === 0) progress("verify", name, count);
      }
      if (count !== audits[name].rows || hash.digest("hex") !== audits[name].sha256)
        throw new Error(`compaction_verification_failed:${name}`);
      progress("verified", name, count, true);
    }
    if (target.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || target.prepare("PRAGMA foreign_key_check").get())
      throw new Error("compaction_integrity_failed");
    target.prepare("DELETE FROM control WHERE key='derivedCleanupCursor'").run();
    target.prepare("INSERT INTO control(key,value) VALUES('derivedPrunedThrough',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(store.sequence));
    const report = { destination, sourceBytes: fs.statSync(store.filename).size, compactedBytes: fs.statSync(destination).size,
      sequence: store.sequence, retainedProjections: keep.size, integrity: "ok", tables: audits,
      maintenanceControlChanges: ["derivedCleanupCursor", "derivedPrunedThrough"] };
    target.close(); target = null;
    const file = fs.openSync(destination, "r"); fs.fsyncSync(file); fs.closeSync(file);
    fs.writeFileSync(`${destination}.manifest.json`, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
    return report;
  } catch (error) {
    if (target) { try { target.exec("ROLLBACK"); } catch { /* Committed or already rolled back. */ } target.close(); }
    if (created) for (const suffix of ["", "-journal", "-wal", "-shm"]) fs.rmSync(destination + suffix, { force: true });
    throw error;
  } finally { source.exec("ROLLBACK"); }
}
