import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DocumentStore,
  localFieldValues,
  canonicalJson,
} from "./document-store.mjs";
import {
  canRead,
  publicValue,
  authorizePublicCommit,
} from "./public-policy.mjs";
import { decodeFields } from "./migrate-firestore.mjs";
const source = () => new DocumentStore(":memory:");
test("transactions retry against a changed version; batches are atomic", async () => {
  const store = source();
  const ref = store.doc("profiles/example");
  await ref.set({ name: "First", count: 0, nested: { one: 1, two: 2 } });
  let retries = 0;
  await store.runTransaction(async (tx) => {
    const data = await tx.get(ref);
    if (!retries++) await ref.update({ name: "Concurrent" });
    tx.update(ref, { count: data.data().count + 1 });
  });
  assert.equal(retries, 2);
  assert.equal((await ref.get()).data().name, "Concurrent");
  assert.equal((await ref.get()).data().count, 1);
  const batch = store.batch();
  batch.set(ref, { count: 99 });
  batch.update(store.doc("profiles/absent"), { bad: true });
  await assert.rejects(batch.commit());
  assert.equal((await ref.get()).data().count, 1);
  store.close();
});
test("replacement, field deletion and recursive removal retain complete prior payloads", async () => {
  const store = source();
  const ref = store.doc("profileStats/example/days/2026-01-01");
  await ref.set({
    day: "2026-01-01",
    source: { id: "original", value: 90 },
    count: 3,
  });
  await ref.set(
    { source: { value: 91 }, count: localFieldValues.increment(1) },
    { merge: true },
  );
  assert.deepEqual((await ref.get()).data(), {
    day: "2026-01-01",
    source: { id: "original", value: 91 },
    count: 4,
  });
  await ref.update({ "source.id": localFieldValues.delete() });
  await store.recursiveDelete(store.doc("profileStats/example"));
  assert.equal((await ref.get()).exists, false);
  const versions = store.getRevisions(ref.path);
  assert.equal(versions.length, 4);
  assert.equal(JSON.parse(versions[0].payload).source.id, "original");
  assert.equal(versions.at(-1).deleted, 1);
  store.close();
});
test("queries preserve ordering, nested equality, inclusive ranges and historical pagination", async () => {
  const store = source();
  await store.doc("competitions/a").set({
    day: "2026-01-01",
    participants: ["me"],
    nested: { id: "x" },
    updatedAt: "a",
  });
  await store.doc("competitions/b").set({
    day: "2026-01-02",
    participants: ["me"],
    nested: { id: "y" },
    updatedAt: "b",
  });
  const at = store.sequence;
  const result = await store
    .collection("competitions")
    .where("participants", "array-contains", "me")
    .where("day", ">=", "2026-01-01")
    .where("day", "<=", "2026-01-02")
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();
  assert.equal(result.docs[0].id, "b");
  assert.equal(
    (await store.collection("competitions").where("nested.id", "==", "x").get())
      .size,
    1,
  );
  await store.doc("competitions/b").delete();
  assert.equal(store.querySnapshot("competitions", [], at).size, 2);
  assert.equal((await store.collection("competitions").get()).size, 1);
  store.close();
});
test("migration retains native wire types and only activates a verified generation", async () => {
  const store = source();
  const wire = {
    name: "projects/oura-friends/databases/(default)/documents/unknown/😀",
    createTime: "2026-01-01T00:00:00.123456789Z",
    updateTime: "2026-01-01T00:00:00.123456789Z",
    fields: {
      large: { integerValue: "9223372036854775807" },
      timestamp: { timestampValue: "2026-01-01T00:00:00.123456789Z" },
      bytes: { bytesValue: "AAE=" },
      nested: { mapValue: { fields: { score: { doubleValue: 90.5 } } } },
      empty: { nullValue: null },
    },
  };
  const run = {
    id: "copy",
    state: "copying",
    projectId: "oura-friends",
    readTime: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    progress: {},
  };
  store.migrationRun(run);
  store.saveMigrationDocument("copy", wire);
  assert.throws(
    () => store.activateMigration("copy", decodeFields),
    /not_verified/,
  );
  assert.throws(
    () => store.saveMigrationDocument("copy", { ...wire, fields: {} }),
    /snapshot_changed/,
  );
  store.migrationRun({ ...run, state: "verified" });
  const manifest = store.activateMigration("copy", decodeFields);
  assert.equal(manifest.documents, 1);
  const value = (await store.doc("unknown/😀").get()).data();
  assert.deepEqual(value.large, {
    __firestoreType: "integer",
    value: "9223372036854775807",
  });
  assert.equal(
    store.database.prepare("SELECT wire_json FROM migration_documents").get()
      .wire_json,
    canonicalJson(wire),
  );
  store.close();
});
test("backup is a consistent independent database and never replaces an existing backup", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oura-backup-test-"));
  const store = new DocumentStore(path.join(dir, "main.sqlite"));
  await store.doc("profiles/a").set({ name: "Example" });
  const result = await store.backup(path.join(dir, "copy.sqlite"));
  assert.equal(result.sha256.length, 64);
  await assert.rejects(
    store.backup(path.join(dir, "copy.sqlite")),
    /already_exists/,
  );
  const copy = new DocumentStore(path.join(dir, "copy.sqlite"));
  assert.equal((await copy.doc("profiles/a").get()).data().name, "Example");
  copy.close();
  store.close();
  // Preserve even the synthetic test files for the no-deletion migration run.
});
test("public access never exposes credentials, revisions, jobs or destructive operations", () => {
  assert.equal(canRead("ouraCredentials/me"), false);
  assert.equal(canRead("insightJobs/me"), false);
  assert.equal(canRead("profileStats/me/revisions/doc"), true); // Existing public subcollection policy only; SQL revision tables have no document path.
  assert.equal(canRead("revisions/me"), false);
  assert.deepEqual(
    publicValue("profiles/me", {
      name: "Example",
      token: "secret",
      refreshToken: "secret",
      tokenExpiresAt: "date",
    }),
    { name: "Example" },
  );
  assert.equal(
    authorizePublicCommit([{ kind: "delete", path: "profiles/me" }]),
    false,
  );
  assert.equal(
    authorizePublicCommit([
      {
        kind: "set",
        path: "profiles/me",
        merge: true,
        data: { token: "secret" },
      },
    ]),
    false,
  );
  assert.equal(
    authorizePublicCommit([
      {
        kind: "set",
        path: "profiles/me",
        merge: true,
        data: { firstName: "Updated" },
      },
    ]),
    true,
  );
});

test("recursive copy discovers unknown collections and missing parents, verifies every document, and makes an independent backup", async () => {
  const { copyFirestore } = await import("./migrate-firestore.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oura-copy-test-"));
  const store = new DocumentStore(path.join(directory, "copy.sqlite"));
  const root = "projects/oura-friends/databases/(default)/documents";
  const profile = {
    name: `${root}/profiles/me`,
    createTime: "2026-01-01T00:00:00Z",
    fields: { name: { stringValue: "Example" } },
  };
  const child = {
    name: `${root}/unknown/missing%3A#?/documents/preserved%`,
    createTime: "2026-01-01T00:00:00Z",
    fields: {
      raw: { bytesValue: "AAECAw==" },
      integer: { integerValue: "9223372036854775807" },
      all: {
        arrayValue: { values: [{ nullValue: null }, { doubleValue: "NaN" }] },
      },
    },
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    let result = {};
    const relative = url.pathname
      .split("/")
      .map(decodeURIComponent)
      .join("/")
      .replace("/v1/", "");
    if (relative === root + ":listCollectionIds")
      result = { collectionIds: ["profiles", "unknown"] };
    else if (relative === root + "/profiles") result = { documents: [profile] };
    else if (relative === root + "/unknown")
      result = { documents: [{ name: root + "/unknown/missing%3A#?" }] };
    else if (relative === root + "/unknown/missing%3A#?:listCollectionIds")
      result = { collectionIds: ["documents"] };
    else if (relative === root + "/unknown/missing%3A#?/documents")
      result = { documents: [child] };
    if (init.method === "GET")
      assert.equal(url.searchParams.get("showMissing"), "true");
    else assert.ok(JSON.parse(init.body).readTime);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const config = {
    FIREBASE_SERVICE_ACCOUNT_JSON: { project_id: "oura-friends" },
    OURA_ARCHIVE_DIR: path.join(directory, "raw"),
    OURA_BACKUP_DIR: path.join(directory, "backup"),
  };
  const result = await copyFirestore(store, config, {
    fetchImpl,
    getAccessToken: async () => "synthetic",
    budgetMs: 45000,
  });
  assert.equal(result.status, "verified");
  assert.equal(result.manifest.documents, 2);
  assert.equal(result.manifest.missingParents, 1);
  assert.ok(fs.existsSync(result.backup.destination));
  assert.equal(store.getControl("activeMigration"), null);
  assert.equal(store.inventory().length, 0);
  const saved = store.database
    .prepare("SELECT wire_json FROM migration_documents WHERE path=?")
    .get("unknown/missing%3A#?/documents/preserved%");
  assert.deepEqual(JSON.parse(saved.wire_json), child);
  const callCount = calls.length;
  await copyFirestore(store, config, {
    fetchImpl,
    getAccessToken: async () => "synthetic",
  });
  assert.equal(calls.length, callCount);
  store.close();
});
test("quota failures pause a copy and never masquerade as an empty successful database", async () => {
  const { copyFirestore } = await import("./migrate-firestore.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oura-quota-test-"));
  const store = source();
  let calls = 0;
  const config = {
    FIREBASE_SERVICE_ACCOUNT_JSON: { project_id: "oura-friends" },
    OURA_ARCHIVE_DIR: directory,
    OURA_BACKUP_DIR: path.join(directory, "backup"),
  };
  const options = {
    getAccessToken: async () => "synthetic",
    fetchImpl: async () => {
      calls++;
      return new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', {
        status: 429,
      });
    },
  };
  const result = await copyFirestore(store, config, options);
  assert.equal(result.status, "source_quota_exhausted");
  assert.equal(store.latestMigration().state, "paused");
  assert.equal(store.getControl("activeMigration"), null);
  await copyFirestore(store, config, options);
  assert.equal(calls, 1);
  store.close();
});

test("activation rolls back imported current data if publication fails, then cannot overwrite live changes", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "oura-activation-test-"),
  );
  const filename = path.join(directory, "test.sqlite");
  const store = new DocumentStore(filename);
  const second = new DocumentStore(filename);
  store.migrationRun({
    id: "copy",
    state: "verified",
    readTime: "2026-01-01T00:00:00Z",
    projectId: "oura-friends",
    progress: {},
    createdAt: "2026-01-01T00:00:00Z",
  });
  store.saveMigrationDocument("copy", {
    name: "projects/oura-friends/databases/(default)/documents/profiles/me",
    fields: { firstName: { stringValue: "Source" } },
  });
  const original = store.setControl.bind(store);
  store.setControl = (key, value) => {
    if (key === "activeMigration") throw new Error("interrupted_publication");
    return original(key, value);
  };
  assert.throws(
    () => store.activateMigration("copy", decodeFields),
    /interrupted_publication/,
  );
  assert.equal((await second.doc("profiles/me").get()).exists, false);
  assert.equal(second.getControl("activeMigration"), null);
  store.setControl = original;
  store.activateMigration("copy", decodeFields);
  await store.doc("profiles/me").update({ firstName: "New live value" });
  assert.throws(
    () => second.activateMigration("copy", decodeFields),
    /already_active/,
  );
  assert.equal(
    (await store.doc("profiles/me").get()).data().firstName,
    "New live value",
  );
  store.close();
  second.close();
});
test("webhook bytes survive split Unicode, and a busy sync never drops the queued event", async () => {
  const { Readable } = await import("node:stream");
  const crypto = await import("node:crypto");
  const { readRequestBytes, enqueueWebhook, replayInbox } = await import(
    "./webhook-inbox.mjs"
  );
  const store = source();
  const raw = Buffer.from(
    JSON.stringify({
      user_id: 123,
      event_type: "delete",
      data_type: "sleep",
      object_id: "original",
      note: "café 🧡",
    }),
  );
  const split = raw.indexOf(Buffer.from("🧡")) + 1;
  const body = await readRequestBytes(
    Readable.from([raw.subarray(0, split), raw.subarray(split)]),
  );
  assert.deepEqual(body, raw);
  const signature = crypto
    .createHmac("sha256", "test-secret")
    .update("123")
    .update(raw)
    .digest("hex")
    .toUpperCase();
  enqueueWebhook(
    store,
    { OURA_CLIENT_SECRET: "test-secret" },
    { "x-oura-timestamp": "123", "x-oura-signature": signature },
    body,
  );
  let reason;
  await replayInbox(store, async (_id, options) => {
    reason = options.reason;
    return [{ status: "skipped" }];
  });
  assert.equal(reason, "replay");
  let saved = store.database.prepare("SELECT * FROM webhook_inbox").get();
  assert.equal(saved.processed_at, null);
  assert.deepEqual(Buffer.from(saved.raw_body), raw);
  store.database.prepare("UPDATE webhook_inbox SET next_retry_at=NULL").run();
  await replayInbox(store, async () => [{ status: "synced" }]);
  saved = store.database.prepare("SELECT * FROM webhook_inbox").get();
  assert.ok(saved.processed_at);
  assert.deepEqual(Buffer.from(saved.raw_body), raw);
  store.close();
});
test("the source freeze keeps read rules while denying every client write permission", async () => {
  const { readonlyRules } = await import("./cutover.mjs");
  const input = {
    files: [
      {
        name: "firestore.rules",
        content:
          "allow read: if true; allow create, update: if true; allow delete: if true; allow read, write: if false; allow get, list, write: if request.auth != null;",
      },
    ],
  };
  const output = readonlyRules(input).files[0].content;
  assert.ok(output.includes("allow read: if true;"));
  assert.ok(output.includes("allow create, update: if false;"));
  assert.ok(output.includes("allow delete: if false;"));
  assert.ok(output.includes("allow get, list: if request.auth != null;"));
  assert.ok(!output.includes("allow get, list, write:"));
});
