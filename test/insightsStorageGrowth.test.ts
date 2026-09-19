// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DocumentStore } from "../mini-pc/document-store.mjs";
import { requestInsightRefresh, runInsightJob } from "../api/_lib/insightsProjection";
import { shiftDay } from "../domain/metrics";
import { pruneDerivedRecords } from "../mini-pc/derived-records.mjs";

async function seed(store: DocumentStore, id = "me") {
  await store.doc(`profiles/${id}`).set({ id, lastKnownUtcOffsetMinutes: 0 });
  await store.doc(`profileStats/${id}`).set({ oldestDay: "2026-01-01", newestDay: "2026-02-09", updatedAt: "initial" });
  for (let i = 0; i < 40; i++) {
    const day = shiftDay("2026-01-01", i);
    await store.doc(`profileStats/${id}/days/${day}`).set({ day, sleep: { id: day, day, score: 60 + i % 30, contributors: {} } });
  }
}
const options = (store: DocumentStore) => ({ db: store as any, now: new Date("2026-02-09T18:00:00Z"), archiveDays: 100, budgetMs: 15000 });
const generatedCount = (store: DocumentStore) => Number(store.database.prepare("SELECT COUNT(*) AS n FROM documents WHERE collection_path LIKE 'profileStats/%/record%' OR collection_path LIKE 'profileStats/%/metricMonths'").get()!.n);

// The app's default Node 20 frontend toolchain has no native SQLite. These
// production-adapter tests run with the documented Node 22+ backend runtime.
describe.skipIf(Number(process.versions.node.split(".")[0]) < 22)("Records growth using the production SQLite adapter", () => {
  it("does not make peers invalidate each other but reacts to changed peer measurements", async () => {
    const store = new DocumentStore(":memory:");
    try {
      await seed(store);
      await seed(store, "peer");
      for (let round = 0; round < 2; round++) {
        for (const id of ["me", "peer"]) await runInsightJob(id, options(store));
      }
      const before = store.sequence;
      for (let round = 0; round < 3; round++) {
        for (const id of ["me", "peer"]) expect((await runInsightJob(id, options(store))).status).toBe("unchanged");
      }
      expect(store.sequence).toBe(before);
      await store.doc("profileStats/peer/days/2026-01-01").set({ day: "2026-01-01", sleep: { id: "2026-01-01", day: "2026-01-01", score: 99 } });
      await requestInsightRefresh(store as any, "peer", ["2026-01"]);
      await runInsightJob("peer", options(store));
      expect((await runInsightJob("me", options(store))).status).toBe("ready");
    } finally { store.close(); }
  });
  it("refuses new Records writes when the storage reserve is exhausted", async () => {
    const store = new DocumentStore(":memory:");
    try {
      await seed(store);
      const before = store.sequence;
      store.assertDerivedWriteCapacity = () => { throw new Error("insufficient_space_for_records"); };
      await expect(runInsightJob("me", options(store))).rejects.toThrow("insufficient_space_for_records");
      expect(store.sequence).toBe(before);
      expect(generatedCount(store)).toBe(0);
    } finally { store.close(); }
  });
  it("bounds generated storage across real source corrections and keeps every original reading", async () => {
    const store = new DocumentStore(":memory:");
    try {
      await seed(store);
      await runInsightJob("me", options(store));
      const initial = generatedCount(store);
      for (let i = 0; i < 6; i++) {
        const ref = store.doc("profileStats/me/days/2026-01-01");
        const value = (await ref.get()).data();
        await ref.set({ ...value, sleep: { ...value.sleep, score: 40 + i } });
        await requestInsightRefresh(store as any, "me", ["2026-01"]);
        await runInsightJob("me", options(store));
        for (const hour of [i * 2, i * 2 + 1]) {
          for (let pass = 0; pass < 8; pass++) pruneDerivedRecords(store, { now: new Date(Date.UTC(2030, 0, 1, hour)), batchSize: 2000 });
        }
        const summary = (await store.doc("profileStats/me/snapshots/insights").get()).data();
        const index = (await store.doc(`profileStats/me/recordIndexes/${summary.archiveIndex}`).get()).data();
        for (const id of Object.values(index.days)) {
          const day = (await store.doc(`profileStats/me/recordDays/${id}`).get()).data();
          for (const page of day.pages) expect((await store.doc(`profileStats/me/recordPages/${page}`).get()).exists).toBe(true);
        }
        expect(generatedCount(store)).toBeLessThan(initial * 2);
      }
      expect(store.getRevisions("profileStats/me/days/2026-01-01")).toHaveLength(7);
    } finally { store.close(); }
  });
  it("settles a completed archive and does not write during unchanged minute polls", async () => {
    const store = new DocumentStore(":memory:");
    try {
      await seed(store);
      await runInsightJob("me", options(store));
      const summary = (await store.doc("profileStats/me/snapshots/insights").get()).data();
      expect(summary.archiveBefore).toBeNull();
      const count = generatedCount(store), sequence = store.sequence;
      for (let i = 0; i < 5; i++) expect((await runInsightJob("me", options(store))).status).toBe("unchanged");
      expect(generatedCount(store)).toBe(count);
      expect(store.sequence).toBe(sequence);
    } finally { store.close(); }
  });
  it("rechecking unchanged source months after SQLite serialization does not rebuild history", async () => {
    const store = new DocumentStore(":memory:");
    try {
      await seed(store);
      await runInsightJob("me", options(store));
      const before = (await store.doc("profileStats/me/snapshots/insights").get()).data();
      const count = generatedCount(store);
      await requestInsightRefresh(store as any, "me", ["2026-01", "2026-02"]);
      await runInsightJob("me", options(store));
      const after = (await store.doc("profileStats/me/snapshots/insights").get()).data();
      expect(after.generation).toBe(before.generation);
      expect(after.archiveBefore).toBeNull();
      expect(generatedCount(store)).toBe(count);
    } finally { store.close(); }
  });
});
