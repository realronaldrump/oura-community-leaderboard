import test from "node:test";
import assert from "node:assert/strict";
import { DocumentStore } from "./document-store.mjs";
import { pruneDerivedRecords } from "./derived-records.mjs";
import { changesSince } from "./change-stream.mjs";

const now = new Date("2030-01-01T12:00:00Z");
const old = "2029-01-01T00:00:00Z";
async function archive(s, id) {
  await s.doc(`profileStats/me/recordPages/${id}`).set({ events: [{ value: 80 }] });
  await s.doc(`profileStats/me/recordDays/${id}`).set({ pages: [id] });
  await s.doc(`profileStats/me/recordIndexes/${id}`).set({ days: { "2029-01-01": id } });
  return { archiveIndex: id, months: {} };
}
function age(s) { s.database.prepare("UPDATE revisions SET recorded_at=?").run(old); }
function sweep(s, options = {}) { for (let i = 0; i < 12; i++) pruneDerivedRecords(s, { now, batchSize: 100, ...options }); }

test("collects only unreachable generated records, retaining raw readings, revisions and current pointers", async () => {
  const s = new DocumentStore(":memory:");
  try {
    await s.doc("profiles/me").set({ name: "Example" });
    await s.doc("profileStats/me/days/2029-01-01").set({ score: 70 });
    await s.doc("profileStats/me/days/2029-01-01").set({ score: 80 });
    await archive(s, "obsolete");
    const current = await archive(s, "current");
    await s.doc("profileStats/me/snapshots/insights").set(current);
    age(s);
    const seq = s.sequence;
    sweep(s);
    assert.equal((await s.doc("profileStats/me/recordPages/obsolete").get()).exists, false);
    assert.equal(s._snapshot("profileStats/me/recordPages/obsolete", seq).exists, true);
    assert.equal(s.querySnapshot("profileStats/me/recordPages", [], seq).size, 2);
    const retiredSequence = s.sequence;
    sweep(s, { now: new Date("2030-01-01T13:00:00Z") });
    assert.equal(s.getRevisions("profileStats/me/recordPages/obsolete").length, 0);
    assert.equal((await s.doc("profileStats/me/recordPages/current").get()).exists, true);
    assert.equal(s.getRevisions("profileStats/me/days/2029-01-01").length, 2);
    assert.equal(s.sequence, retiredSequence);
    assert.deepEqual(changesSince(s, "0"), { revision: retiredSequence });
  } finally { s.close(); }
});

test("retains old published readers, unpublished young writes, draft and peer metric references", async () => {
  const s = new DocumentStore(":memory:");
  try {
    await s.doc("profiles/me").set({ name: "Example" });
    const previous = await archive(s, "previous");
    await s.doc("profileStats/me/snapshots/insights").set(previous);
    await s.doc("profileStats/me/metricMonths/draft-month").set({ observations: [] });
    await s.doc("profileStats/peer/metricMonths/peer-month").set({ observations: [] });
    age(s);
    const current = await archive(s, "current");
    await s.doc("profileStats/me/snapshots/insights").set({ ...current, peerInputs: { peer: { months: { m: "peer-month" } } } });
    await s.doc("profileStats/me/snapshots/insights-draft").set({ months: { m: "draft-month" } });
    await archive(s, "in-flight");
    s.database.prepare("UPDATE revisions SET recorded_at=? WHERE recorded_at<>?").run("2030-01-01T11:59:00Z", old);
    sweep(s);
    for (const id of ["previous", "current", "in-flight"]) assert.equal((await s.doc(`profileStats/me/recordPages/${id}`).get()).exists, true);
    assert.equal((await s.doc("profileStats/me/metricMonths/draft-month").get()).exists, true);
    assert.equal((await s.doc("profileStats/peer/metricMonths/peer-month").get()).exists, true);
    sweep(s, { now: new Date("2030-01-01T13:00:00Z") });
    assert.equal((await s.doc("profileStats/me/recordPages/previous").get()).exists, false);
    assert.equal((await s.doc("profileStats/me/recordPages/in-flight").get()).exists, false);
    assert.equal((await s.doc("profileStats/me/recordPages/current").get()).exists, true);
  } finally { s.close(); }
});

test("bounded sweeps advance past protected documents and fail closed on missing manifests", async () => {
  const s = new DocumentStore(":memory:");
  try {
    await s.doc("profiles/me").set({ name: "Example" });
    const current = await archive(s, "aaa-current");
    await s.doc("profileStats/me/snapshots/insights").set(current);
    for (let i=0;i<5;i++) await archive(s, `zzz-${i}`);
    age(s);
    for (let i=0;i<40;i++) {
      const result=pruneDerivedRecords(s,{now,batchSize:2});
      assert.ok(result.scanned<=2);
    }
    assert.equal((await s.collection("profileStats/me/recordPages").get()).size,1);
    await archive(s,"orphan"); age(s);
    await s.doc("profileStats/me/snapshots/insights").set({archiveIndex:"missing",months:{}}); age(s);
    assert.throws(()=>pruneDerivedRecords(s,{now}),/missing_derived_reference/);
    assert.equal((await s.doc("profileStats/me/recordPages/orphan").get()).exists,true);
  } finally { s.close(); }
});
