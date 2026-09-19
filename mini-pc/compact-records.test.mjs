import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DocumentStore } from "./document-store.mjs";
import { compactRecords } from "./compact-records.mjs";
import { DERIVED_GRACE_MS } from "./derived-records.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oura-compact-"));
  const store = new DocumentStore(path.join(directory, "original.sqlite"));
  const destination = path.join(directory, "compact.sqlite");
  const options = () => ({ destination, quiescedAt: new Date(Date.now() + 1000).toISOString(), now: new Date(Date.now() + DERIVED_GRACE_MS + 2000) });
  return { directory, store, destination, options };
}
async function archive(store, id, payload = "retained") {
  await store.doc(`profileStats/me/recordPages/${id}`).set({ events: [payload] });
  await store.doc(`profileStats/me/recordDays/${id}`).set({ pages: [id] });
  await store.doc(`profileStats/me/recordIndexes/${id}`).set({ days: { "2026-01-01": id } });
}

test("compaction preserves complete original history, unknown data, schema, drafts, peer inputs and high-water marks", async () => {
  const f = fixture(); let copy;
  try {
    const s = f.store;
    await s.doc("profiles/me").set({ name: "Synthetic" });
    await s.doc("profileStats/me/days/2026-01-01").set({ score: 70 });
    await s.doc("profileStats/me/days/2026-01-01").set({ score: 80 });
    await s.doc("ouraCredentials/me").set({ token: "synthetic-only" });
    await s.doc("unknown/data").set({ nested: [1, "keep"] });
    await archive(s, "current");
    await s.doc("profileStats/peer/metricMonths/peer").set({ observations: [1] });
    await s.doc("profileStats/me/metricMonths/draft").set({ observations: [2] });
    await s.doc("profileStats/me/snapshots/insights").set({ archiveIndex: "current", peerInputs: { peer: { months: { m: "peer" } } } });
    await s.doc("profileStats/me/snapshots/insights-draft").set({ months: { m: "draft" } });
    for (let i=0;i<6;i++) await archive(s, `obsolete-${i}`, "x".repeat(500000));
    s.database.exec("CREATE TABLE extra_data(id INTEGER PRIMARY KEY, label TEXT, bytes BLOB); CREATE INDEX extra_label ON extra_data(label); CREATE VIEW extra_view AS SELECT label FROM extra_data; PRAGMA user_version=7");
    s.database.prepare("INSERT INTO extra_data VALUES(?,?,?)").run(9223372036854775807n, "preserve", Buffer.from([0, 128, 255]));
    const sequence = s.sequence;
    const result = compactRecords(s, f.options());
    assert.equal(result.integrity, "ok");
    assert.ok(result.compactedBytes < result.sourceBytes / 3);
    assert.equal(s.sequence, sequence);
    assert.equal((await s.doc("profileStats/me/recordPages/obsolete-0").get()).exists, true);
    copy = new DocumentStore(f.destination);
    assert.equal(copy.sequence, sequence);
    assert.equal(copy.getRevisions("profileStats/me/days/2026-01-01").length, 2);
    assert.equal((await copy.doc("profileStats/me/recordPages/obsolete-0").get()).exists, false);
    assert.equal((await copy.doc("profileStats/me/recordPages/current").get()).exists, true);
    assert.equal((await copy.doc("profileStats/me/metricMonths/draft").get()).exists, true);
    assert.equal((await copy.doc("profileStats/peer/metricMonths/peer").get()).exists, true);
    assert.deepEqual((await copy.doc("unknown/data").get()).data(), { nested: [1, "keep"] });
    const query = copy.database.prepare("SELECT * FROM extra_data"); query.setReadBigInts(true);
    assert.deepEqual({ ...query.get() }, { id: 9223372036854775807n, label: "preserve", bytes: new Uint8Array([0, 128, 255]) });
    assert.equal(copy.database.prepare("SELECT label FROM extra_view").get().label, "preserve");
    assert.equal(copy.database.prepare("PRAGMA user_version").get().user_version, 7);
    assert.equal(copy.getControl("derivedPrunedThrough"), sequence);
  } finally { copy?.close(); f.store.close(); fs.rmSync(f.directory, { recursive: true }); }
});

test("compaction refuses active writers, insufficient grace, existing files and broken references", async () => {
  const f = fixture();
  try {
    await f.store.doc("profiles/me").set({ name: "Synthetic" });
    assert.throws(() => compactRecords(f.store, { destination: f.destination, quiescedAt: new Date().toISOString() }), /15_minutes/);
    assert.throws(() => compactRecords(f.store, { ...f.options(), quiescedAt: "2000-01-01" }), /writes_after/);
    fs.writeFileSync(f.destination, "do not replace");
    assert.throws(() => compactRecords(f.store, f.options()), /must_be_new/);
    assert.equal(fs.readFileSync(f.destination, "utf8"), "do not replace");
    fs.unlinkSync(f.destination);
    await f.store.doc("profileStats/me/snapshots/insights").set({ archiveIndex: "missing" });
    assert.throws(() => compactRecords(f.store, f.options()), /missing_compaction_reference/);
    assert.equal(fs.existsSync(f.destination), false);
    await f.store.doc("unknown/after-failure").set({ stillWritable: true });
  } finally { f.store.close(); fs.rmSync(f.directory, { recursive: true }); }
});

test("failed compaction removes only its new partial file and leaves the original usable", async () => {
  const f = fixture();
  try {
    await f.store.doc("profiles/me").set({ name: "Synthetic" });
    assert.throws(() => compactRecords(f.store, { ...f.options(), onProgress: () => { throw new Error("simulated_failure"); } }), /simulated_failure/);
    assert.equal(fs.existsSync(f.destination), false);
    assert.equal((await f.store.doc("profiles/me").get()).data().name, "Synthetic");
    await f.store.doc("unknown/still-writable").set({ safe: true });
  } finally { f.store.close(); fs.rmSync(f.directory, { recursive: true }); }
});
