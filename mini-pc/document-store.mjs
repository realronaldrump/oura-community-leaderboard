import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json"));
export const localFieldValues = {
  delete: () => ({ __ouraTransform: "delete" }),
  increment: (value) => ({ __ouraTransform: "increment", value }),
};
const clone = (value) => (value == null ? value : structuredClone(value));
const sourceCollections = new Set([
  "days", "heartRateDays", "sleepSessions", "workouts", "tags", "enhancedTags",
  "guidedSessions", "sleepTime", "restModePeriods", "ringConfigurations",
  "ringBatteryLevels", "vo2Max", "personalInfo",
]);
const rollback = database => {
  // SQLITE_FULL can already have rolled back the transaction. Preserve the
  // original error instead of replacing it with "no transaction is active".
  try { database.exec("ROLLBACK"); } catch { /* Already rolled back. */ }
};
const isMap = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const field = (value, name) =>
  name
    .split(".")
    .reduce(
      (v, key) => (v && Object.hasOwn(v, key) ? v[key] : undefined),
      value,
    );
const safePart = (name) =>
  typeof name === "string" &&
  name.length &&
  !["__proto__", "prototype", "constructor"].includes(name);
const fileDigest = (filename) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const canonicalJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    isMap(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  );
function mergeFields(previous, incoming, merge) {
  const result = merge && isMap(previous) ? clone(previous) : {};
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value === undefined) continue;
    if (value?.__ouraTransform === "delete") {
      delete result[key];
      continue;
    }
    if (value?.__ouraTransform === "increment") {
      result[key] =
        (typeof result[key] === "number" ? result[key] : 0) + value.value;
      continue;
    }
    const nextValue =
      isMap(value) && !value.__firestoreType
        ? Object.keys(value).length
          ? mergeFields(
              Object.hasOwn(result, key) ? result[key] : undefined,
              value,
              merge,
            )
          : {}
        : clone(value);
    Object.defineProperty(result, key, {
      value: nextValue,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
function applyUpdate(previous, incoming) {
  const result = clone(previous);
  for (const [key, value] of Object.entries(incoming)) {
    const keys = key.split(".");
    if (!keys.every(safePart)) throw new Error("unsafe_field_name");
    let current = result;
    for (const part of keys.slice(0, -1)) {
      if (!isMap(current[part])) current[part] = {};
      current = current[part];
    }
    const leaf = keys.at(-1);
    if (value?.__ouraTransform === "delete") delete current[leaf];
    else if (value?.__ouraTransform === "increment")
      current[leaf] =
        (typeof current[leaf] === "number" ? current[leaf] : 0) + value.value;
    else current[leaf] = clone(value);
  }
  return result;
}
const validatePath = (value, kind) => {
  if (
    typeof value !== "string" ||
    value.length > 6000 ||
    !value
      .split("/")
      .every((part) => part.length && part !== "." && part !== "..")
  )
    throw new Error("invalid_document_path");
  if (value.split("/").length % 2 !== (kind === "collection" ? 1 : 0))
    throw new Error("invalid_path_kind");
  return value;
};
export const localDocumentPath = (name) => {
  const prefix = "projects/oura-friends/databases/(default)/documents/";
  if (typeof name !== "string" || !name.startsWith(prefix))
    throw new Error("unexpected_source_document");
  return validatePath(name.slice(prefix.length), "document");
};
export class StoreConflict extends Error {
  constructor() {
    super("document_version_conflict");
    this.code = "aborted";
  }
}
export class DocumentStore {
  constructor(filename, options = {}) {
    const { DatabaseSync } = require("node:sqlite");
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(filename);
    this.filename = filename;
    this.onChange = options.onChange || (() => {});
    this.database
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, collection_path TEXT NOT NULL, document_id TEXT NOT NULL, payload TEXT, deleted INTEGER NOT NULL DEFAULT 0, recorded_at TEXT NOT NULL, reason TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revision_path ON revisions(path, seq);
      CREATE INDEX IF NOT EXISTS revision_collection ON revisions(collection_path, seq);
      CREATE TABLE IF NOT EXISTS documents(path TEXT PRIMARY KEY, collection_path TEXT NOT NULL, document_id TEXT NOT NULL, payload TEXT, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS document_collection ON documents(collection_path, document_id);
      CREATE TABLE IF NOT EXISTS migration_runs(id TEXT PRIMARY KEY, state TEXT NOT NULL, read_time TEXT NOT NULL, source_project TEXT NOT NULL, progress TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migration_documents(run_id TEXT NOT NULL, path TEXT NOT NULL, wire_json TEXT NOT NULL, sha256 TEXT NOT NULL, missing INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(run_id,path));
      CREATE TABLE IF NOT EXISTS control(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS webhook_inbox(id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, headers TEXT NOT NULL, received_at TEXT NOT NULL, processed_at TEXT);
    `);
    const columns = this.database
      .prepare("PRAGMA table_info(webhook_inbox)")
      .all()
      .map((c) => c.name);
    for (const [name, definition] of [
      ["raw_body", "BLOB"],
      ["next_retry_at", "TEXT"],
      ["last_error", "TEXT"],
      ["attempts", "INTEGER NOT NULL DEFAULT 0"],
    ])
      if (!columns.includes(name))
        this.database.exec(
          `ALTER TABLE webhook_inbox ADD COLUMN ${name} ${definition}`,
        );
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
  }
  close() {
    this.database.close();
  }
  assertDerivedWriteCapacity() {
    if (this.filename === ":memory:") return;
    const disk = fs.statfsSync(path.dirname(fs.realpathSync(this.filename)));
    if (disk.bavail * disk.bsize < 5 * 1024 ** 3)
      throw new Error("insufficient_space_for_records");
  }
  get sequence() {
    return Number(
      this.database
        .prepare("SELECT seq FROM sqlite_sequence WHERE name='revisions'")
        .get()?.seq || 0,
    );
  }
  getControl(key) {
    const row = this.database
      .prepare("SELECT value FROM control WHERE key=?")
      .get(key);
    return row ? JSON.parse(row.value) : null;
  }
  setControl(key, value) {
    this.database
      .prepare(
        "INSERT INTO control(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  claimControlLease(key, durationMs = 90000) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.getControl(key);
      if (previous?.until > Date.now()) {
        this.database.exec("COMMIT");
        return null;
      }
      const token = crypto.randomUUID();
      this.setControl(key, { token, until: Date.now() + durationMs });
      this.database.exec("COMMIT");
      return token;
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }
  releaseControlLease(key, token) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (this.getControl(key)?.token === token)
        this.setControl(key, { token: null, until: 0 });
      this.database.exec("COMMIT");
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }
  _row(documentPath, at) {
    return at == null
      ? this.database
          .prepare("SELECT * FROM documents WHERE path=?")
          .get(documentPath)
      : this.database
          .prepare(
            "SELECT *,seq AS version FROM revisions WHERE path=? AND seq<=? ORDER BY seq DESC LIMIT 1",
          )
          .get(documentPath, at);
  }
  _snapshot(documentPath, at) {
    const row = this._row(documentPath, at);
    return {
      id: documentPath.split("/").at(-1),
      ref: this.doc(documentPath),
      exists: Boolean(row && !row.deleted),
      version: Number(row?.version || 0),
      data: () => (row && !row.deleted ? JSON.parse(row.payload) : undefined),
    };
  }
  doc(documentPath) {
    validatePath(documentPath, "document");
    return {
      path: documentPath,
      id: documentPath.split("/").at(-1),
      collection: (name) => this.collection(`${documentPath}/${name}`),
      get: async () => this._snapshot(documentPath),
      set: async (value, options) =>
        this.commit([
          {
            kind: "set",
            path: documentPath,
            data: value,
            merge: options?.merge === true,
          },
        ]),
      update: async (value) =>
        this.commit([{ kind: "update", path: documentPath, data: value }]),
      delete: async () => this.commit([{ kind: "delete", path: documentPath }]),
    };
  }
  collection(collectionPath) {
    validatePath(collectionPath, "collection");
    return this._query(collectionPath, []);
  }
  _query(collectionPath, constraints) {
    return {
      path: collectionPath,
      constraints,
      doc: (id = crypto.randomUUID()) => this.doc(`${collectionPath}/${id}`),
      where: (name, op, value) =>
        this._query(collectionPath, [
          ...constraints,
          { type: "where", field: name, op, value },
        ]),
      orderBy: (name, direction = "asc") =>
        this._query(collectionPath, [
          ...constraints,
          { type: "orderBy", field: name, direction },
        ]),
      limit: (value) =>
        this._query(collectionPath, [...constraints, { type: "limit", value }]),
      get: async () => this.querySnapshot(collectionPath, constraints),
    };
  }
  querySnapshot(collectionPath, constraints = [], at) {
    validatePath(collectionPath, "collection");
    let rows =
      at == null || at === this.sequence
        ? this.database
            .prepare(
              "SELECT * FROM documents WHERE collection_path=? AND deleted=0",
            )
            .all(collectionPath)
        : this.database
            .prepare(
              "SELECT r.*,r.seq AS version FROM revisions r JOIN (SELECT path,MAX(seq) AS seq FROM revisions WHERE collection_path=? AND seq<=? GROUP BY path) latest ON latest.seq=r.seq WHERE r.deleted=0",
            )
            .all(collectionPath, at);
    let items = rows.map((row) => ({ row, data: JSON.parse(row.payload) }));
    for (const constraint of constraints) {
      if (constraint.type !== "where") continue;
      if (
        !["==", ">=", "<=", "<", ">", "array-contains"].includes(constraint.op)
      )
        throw new Error("unsupported_query_operator");
      items = items.filter((item) => {
        const value = field(item.data, constraint.field);
        const target = constraint.value;
        if (value === undefined) return false;
        return constraint.op === "=="
          ? canonicalJson(value) === canonicalJson(target)
          : constraint.op === ">="
            ? value >= target
            : constraint.op === "<="
              ? value <= target
              : constraint.op === "<"
                ? value < target
                : constraint.op === ">"
                  ? value > target
                  : Array.isArray(value) &&
                    value.some(
                      (v) => canonicalJson(v) === canonicalJson(target),
                    );
      });
    }
    const orderings = constraints.filter((c) => c.type === "orderBy");
    items = items.filter((item) =>
      orderings.every(
        (c) =>
          c.field === "__name__" || field(item.data, c.field) !== undefined,
      ),
    );
    items.sort((a, b) => {
      for (const order of orderings) {
        const av =
          order.field === "__name__"
            ? a.row.document_id
            : field(a.data, order.field);
        const bv =
          order.field === "__name__"
            ? b.row.document_id
            : field(b.data, order.field);
        const result = av < bv ? -1 : av > bv ? 1 : 0;
        if (result) return order.direction === "desc" ? -result : result;
      }
      return a.row.path < b.row.path ? -1 : a.row.path > b.row.path ? 1 : 0;
    });
    const maximum = constraints.find((c) => c.type === "limit")?.value;
    if (maximum != null) items = items.slice(0, Math.max(0, maximum));
    const docs = items.map((item) => ({
      id: item.row.document_id,
      ref: this.doc(item.row.path),
      exists: true,
      version: Number(item.row.version),
      data: () => clone(item.data),
    }));
    return {
      docs,
      size: docs.length,
      empty: !docs.length,
      forEach: (callback) => docs.forEach(callback),
    };
  }
  async getAll(...references) {
    const at = this.sequence;
    return references.map((ref) => this._snapshot(ref.path, at));
  }
  batch() {
    const operations = [];
    const batch = {
      set: (ref, data, options) => {
        operations.push({
          kind: "set",
          path: ref.path,
          data,
          merge: options?.merge === true,
        });
        return batch;
      },
      update: (ref, data) => {
        operations.push({ kind: "update", path: ref.path, data });
        return batch;
      },
      delete: (ref) => {
        operations.push({ kind: "delete", path: ref.path });
        return batch;
      },
      commit: async () => this.commit(operations),
    };
    return batch;
  }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const at = this.sequence;
      const versions = {};
      const operations = [];
      const tx = {
        get: async (ref) => {
          const snap = this._snapshot(ref.path, at);
          versions[ref.path] = snap.version;
          return snap;
        },
        set: (ref, data, options) =>
          operations.push({
            kind: "set",
            path: ref.path,
            data,
            merge: options?.merge === true,
          }),
        update: (ref, data) =>
          operations.push({ kind: "update", path: ref.path, data }),
        delete: (ref) => operations.push({ kind: "delete", path: ref.path }),
      };
      const result = await callback(tx);
      try {
        this.commit(operations, versions);
        return result;
      } catch (error) {
        if (!(error instanceof StoreConflict) || attempt === 5) throw error;
      }
    }
  }
  commit(
    operations,
    expectedVersions = {},
    reason = "application",
    nested = false,
  ) {
    const changed = [];
    if (!nested) this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const [documentPath, version] of Object.entries(expectedVersions))
        if (Number(this._row(documentPath)?.version || 0) !== version)
          throw new StoreConflict();
      for (const operation of operations) {
        validatePath(operation.path, "document");
        const old = this._row(operation.path);
        const previous =
          old && !old.deleted ? JSON.parse(old.payload) : undefined;
        if (operation.kind === "update" && previous == null)
          throw new Error("document_not_found");
        const deleted = operation.kind === "delete" ? 1 : 0;
        const value = deleted
          ? null
          : operation.imported
            ? clone(operation.data)
            : operation.kind === "update"
              ? applyUpdate(previous, operation.data)
              : mergeFields(previous, operation.data, operation.merge === true);
        const payload = deleted ? null : canonicalJson(value);
        if (old && old.payload === payload && old.deleted === deleted) continue;
        const parts = operation.path.split("/");
        if (old && !old.deleted && !deleted && !operation.imported &&
          parts.length === 4 && parts[0] === "profileStats" && sourceCollections.has(parts[2]) &&
          canonicalJson({ ...previous, updatedAt: null }) === canonicalJson({ ...value, updatedAt: null })) continue;
        const collectionPath = operation.path.split("/").slice(0, -1).join("/");
        const id = operation.path.split("/").at(-1);
        const inserted = this.database
          .prepare(
            "INSERT INTO revisions(path,collection_path,document_id,payload,deleted,recorded_at,reason) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            operation.path,
            collectionPath,
            id,
            payload,
            deleted,
            new Date().toISOString(),
            reason,
          );
        const version = Number(inserted.lastInsertRowid);
        this.database
          .prepare(
            "INSERT INTO documents(path,collection_path,document_id,payload,deleted,version) VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET payload=excluded.payload,deleted=excluded.deleted,version=excluded.version",
          )
          .run(operation.path, collectionPath, id, payload, deleted, version);
        changed.push(operation.path);
      }
      if (!nested) this.database.exec("COMMIT");
    } catch (error) {
      if (!nested) rollback(this.database);
      throw error;
    }
    if (!nested && changed.length) this.onChange(changed, this.sequence);
    return { revision: this.sequence };
  }
  // Compatibility with old lifecycle code: logical archival only; revisions are permanent.
  async recursiveDelete(reference) {
    const rows = this.database
      .prepare("SELECT path FROM documents WHERE path=? OR substr(path,1,?)=?")
      .all(reference.path, reference.path.length + 1, reference.path + "/");
    return this.commit(
      rows.map((row) => ({ kind: "delete", path: row.path })),
      {},
      "archived_not_deleted",
    );
  }
  getRevisions(documentPath) {
    return this.database
      .prepare("SELECT * FROM revisions WHERE path=? ORDER BY seq")
      .all(documentPath);
  }
  inventory() {
    return this.database
      .prepare(
        "SELECT collection_path,COUNT(*) AS documents FROM documents WHERE deleted=0 GROUP BY collection_path ORDER BY collection_path",
      )
      .all();
  }
  async backup(destination) {
    const { backup } = require("node:sqlite");
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    if (fs.existsSync(destination)) throw new Error("backup_already_exists");
    await backup(this.database, destination);
    fs.chmodSync(destination, 0o600);
    const checksum = await fileDigest(destination);
    const { DatabaseSync } = require("node:sqlite");
    const check = new DatabaseSync(destination, { readOnly: true });
    try {
      if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok")
        throw new Error("backup_integrity_failed");
    } finally {
      check.close();
    }
    fs.writeFileSync(
      destination + ".sha256",
      `${checksum}  ${path.basename(destination)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    return {
      destination,
      sha256: checksum,
      bytes: fs.statSync(destination).size,
    };
  }
  migrationRun(run) {
    this.database
      .prepare(
        "INSERT INTO migration_runs(id,state,read_time,source_project,progress,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,progress=excluded.progress",
      )
      .run(
        run.id,
        run.state,
        run.readTime,
        run.projectId,
        JSON.stringify(run.progress),
        run.createdAt,
      );
  }
  latestMigration() {
    const row = this.database
      .prepare("SELECT * FROM migration_runs ORDER BY created_at DESC LIMIT 1")
      .get();
    return row
      ? {
          id: row.id,
          state: row.state,
          readTime: row.read_time,
          projectId: row.source_project,
          progress: JSON.parse(row.progress),
          createdAt: row.created_at,
        }
      : null;
  }
  saveMigrationDocument(runId, wire, missing = false) {
    const documentPath = localDocumentPath(wire.name);
    validatePath(documentPath, "document");
    const encoded = canonicalJson(wire);
    const sha256 = digest(encoded);
    const existing = this.database
      .prepare(
        "SELECT sha256 FROM migration_documents WHERE run_id=? AND path=?",
      )
      .get(runId, documentPath);
    if (existing && existing.sha256 !== sha256)
      throw new Error("source_snapshot_changed");
    this.database
      .prepare(
        "INSERT INTO migration_documents(run_id,path,wire_json,sha256,missing) VALUES(?,?,?,?,?) ON CONFLICT(run_id,path) DO UPDATE SET wire_json=excluded.wire_json,sha256=excluded.sha256,missing=excluded.missing",
      )
      .run(runId, documentPath, encoded, sha256, Number(missing));
    return { path: documentPath, sha256 };
  }
  migrationManifest(runId) {
    const rows = this.database
      .prepare(
        "SELECT path,sha256,wire_json,missing FROM migration_documents WHERE run_id=? ORDER BY path",
      )
      .iterate(runId);
    const hash = crypto.createHash("sha256");
    const counts = {};
    let documents = 0;
    let missingParents = 0;
    for (const row of rows) {
      if (digest(row.wire_json) !== row.sha256)
        throw new Error("migration_checksum_mismatch");
      hash.update(`${row.path}\0${row.sha256}\n`);
      if (!row.missing) {
        documents++;
        const key = row.path.split("/").slice(0, -1).join("/");
        counts[key] = (counts[key] || 0) + 1;
      } else missingParents++;
    }
    return {
      documents,
      missingParents,
      collections: counts,
      sha256: hash.digest("hex"),
    };
  }
  activateMigration(runId, decode) {
    this.database.exec("BEGIN IMMEDIATE");
    const importedPaths = [];
    try {
      if (this.getControl("activeMigration"))
        throw new Error("already_active_do_not_overwrite");
      const run = this.database
        .prepare("SELECT state FROM migration_runs WHERE id=?")
        .get(runId);
      if (run?.state !== "verified") throw new Error("migration_not_verified");
      const rows = this.database
        .prepare(
          "SELECT * FROM migration_documents WHERE run_id=? AND missing=0 ORDER BY path",
        )
        .iterate(runId);
      function* operations() {
        for (const row of rows) {
          importedPaths.push(row.path);
          yield {
            kind: "set",
            path: row.path,
            data: decode(JSON.parse(row.wire_json).fields || {}),
            imported: true,
          };
        }
      }
      this.commit(operations(), {}, `migration:${runId}`, true);
      this.setControl("activeMigration", runId);
      this.setControl("sourceWritesFrozen", true);
      this.database.exec("COMMIT");
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    this.onChange(importedPaths, this.sequence);
    return this.migrationManifest(runId);
  }
}
let singleton;
export const getLocalDocumentStore = () => {
  if (!singleton) singleton = new DocumentStore(process.env.OURA_DB_PATH);
  return singleton;
};
