import { describe, expect, it } from "vitest";
import {
  requestInsightRefresh,
  runInsightJob,
} from "../api/_lib/insightsProjection";
import { shiftDay } from "../domain/metrics";
import { RULES_VERSION } from "../domain/records";

/** Small transaction-aware Firestore adapter; no live account or health data. */
function memoryFirestore() {
  const data = new Map<string, any>();
  let rejectWrite: ((path: string) => boolean) | null = null;
  let beforeRead: ((path: string) => void) | null = null;
  const valueAt = (value: any, key: string) =>
    key.split(".").reduce((row, field) => row?.[field], value);
  const snapshot = (path: string) => {
    beforeRead?.(path);
    return {
      id: path.split("/").at(-1),
      exists: data.has(path),
      data: () =>
        data.has(path) ? structuredClone(data.get(path)) : undefined,
    };
  };
  const write = (path: string, value: any, options?: { merge?: boolean }) => {
    if (rejectWrite?.(path)) throw new Error("simulated_write_failure");
    data.set(
      path,
      options?.merge
        ? { ...(data.get(path) || {}), ...structuredClone(value) }
        : structuredClone(value),
    );
  };
  function query(path: string, filters: any[] = []) {
    return {
      where: (field: string, operator: string, value: any) =>
        query(path, [...filters, [field, operator, value]]),
      get: async () => {
        const docs = [...data.keys()]
          .filter(
            (key) =>
              key.startsWith(path + "/") &&
              key.split("/").length === path.split("/").length + 1,
          )
          .filter((key) =>
            filters.every(([field, op, value]) =>
              op === ">="
                ? valueAt(data.get(key), field) >= value
                : op === "<="
                  ? valueAt(data.get(key), field) <= value
                  : valueAt(data.get(key), field) === value,
            ),
          )
          .map(snapshot);
        return { docs, empty: !docs.length, size: docs.length };
      },
      doc: (id: string) => ref(path + "/" + id),
    };
  }
  function ref(path: string): any {
    return {
      path,
      id: path.split("/").at(-1),
      get: async () => snapshot(path),
      set: async (value: any, options: any) => write(path, value, options),
      delete: async () => data.delete(path),
      collection: (name: string) => query(path + "/" + name),
    };
  }
  const db: any = {
    collection: (name: string) => query(name),
    doc: ref,
    getAll: async (...refs: any[]) => refs.map((r) => snapshot(r.path)),
    runTransaction: async (fn: any) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: async (r: any) => snapshot(r.path),
        set: (r: any, value: any, options: any) =>
          writes.push(() => write(r.path, value, options)),
        delete: (r: any) => writes.push(() => data.delete(r.path)),
      });
      for (const apply of writes) apply();
      return result;
    },
  };
  return {
    db,
    data,
    reject: (fn: typeof rejectWrite) => {
      rejectWrite = fn;
    },
    onRead: (fn: typeof beforeRead) => {
      beforeRead = fn;
    },
  };
}
function seed(store: ReturnType<typeof memoryFirestore>, count = 50) {
  store.data.set("profiles/me", {
    id: "me",
    firstName: "Example",
    lastKnownUtcOffsetMinutes: 0,
  });
  const day = shiftDay("2026-01-01", count - 1);
  store.data.set("profileStats/me", {
    oldestDay: "2026-01-01",
    newestDay: day,
    updatedAt: "revision-1",
  });
  for (let i = 0; i < count; i++) {
    const d = shiftDay("2026-01-01", i);
    store.data.set(`profileStats/me/days/${d}`, {
      day: d,
      sleep: {
        id: `sleep-${i}`,
        day: d,
        score: i === count - 1 ? 98 : 60 + (i % 30),
        contributors: {},
      },
    });
  }
  return new Date(`${day}T18:00:00Z`);
}
describe("server records publication", () => {
  it("publishes compact summaries and immutable archive pointers, then resumes older days", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    const first = await runInsightJob("me", {
      db: store.db,
      now,
      budgetMs: 15000,
      archiveDays: 2,
    });
    expect(first.status).toBe("ready");
    const summary = store.data.get("profileStats/me/snapshots/insights");
    const originalIndex = structuredClone(
      store.data.get(`profileStats/me/recordIndexes/${summary.archiveIndex}`),
    );
    expect(summary.featured.length).toBeLessThanOrEqual(3);
    expect(summary.featured[0]).toMatchObject({ kind: "personal_best", day: summary.day });
    expect(summary.personalBests.metrics[0]).toMatchObject({ metricId: "sleep_score" });
    expect(new Set(summary.recent.map((e: any) => e.id)).size).toBe(summary.recent.length);
    expect(summary.archiveBefore).toBeTruthy();
    expect(JSON.stringify(summary).length).toBeLessThan(64000);
    await runInsightJob("me", {
      db: store.db,
      now,
      budgetMs: 15000,
      archiveDays: 2,
    });
    const next = store.data.get("profileStats/me/snapshots/insights");
    expect(next.archiveBefore < summary.archiveBefore).toBe(true);
    expect(next.generation).toBe(summary.generation);
    expect(
      store.data.get(`profileStats/me/recordIndexes/${summary.archiveIndex}`),
    ).toEqual(originalIndex);
  });
  it("indexes only days that have records", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    await runInsightJob("me", { db: store.db, now, archiveDays: 60 });
    const summary = store.data.get("profileStats/me/snapshots/insights");
    expect(summary.archiveBefore).toBeNull();
    const index = store.data.get(`profileStats/me/recordIndexes/${summary.archiveIndex}`);
    expect(Object.keys(index.days)).toContain(summary.day);
    for (const id of Object.values<string>(index.days)) {
      const pages = store.data.get(`profileStats/me/recordDays/${id}`).pages;
      expect(pages.length).toBeGreaterThan(0);
    }
    expect(index.cooldowns).toEqual([
      expect.objectContaining({ id: summary.featured[0].id, featuredOn: summary.day }),
    ]);
  });
  it("starts fresh after a rules change and never rebuilds over newer rules", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    const day = shiftDay("2026-01-01", 49);
    const legacy = { id: `me:sleep_score:mean:30:high:${shiftDay(day, -1)}`, metricId: "sleep_score", family: "mean", day: shiftDay(day, -1), evidence: { rank: 1 } };
    store.data.set("profileStats/me/recordIndexes/old", {
      days: {},
      cooldowns: [{ metricId: "sleep_score", family: "daily", direction: "high", day: shiftDay(day, -1), value: 1, evidence: { rank: 1 } }],
    });
    store.data.set("profileStats/me/snapshots/insights", {
      rulesVersion: "records-1", exclusions: "[]", archiveIndex: "old", recent: [legacy], featured: [], months: {},
    });
    expect((await runInsightJob("me", { db: store.db, now, archiveDays: 1 })).status).toBe("ready");
    const summary = store.data.get("profileStats/me/snapshots/insights");
    expect(summary.rulesVersion).toBe(RULES_VERSION);
    expect(summary.recent.some((e: any) => e.id === legacy.id)).toBe(false);
    const index = store.data.get(`profileStats/me/recordIndexes/${summary.archiveIndex}`);
    expect(index.cooldowns.every((c: any) => c.featuredOn)).toBe(true);
    const newer = { ...summary, rulesVersion: "records-99", inputKey: "other" };
    store.data.set("profileStats/me/snapshots/insights", newer);
    const writes = store.data.size;
    expect((await runInsightJob("me", { db: store.db, now, archiveDays: 1 })).status).toBe("newer_rules");
    expect(store.data.get("profileStats/me/snapshots/insights")).toEqual(newer);
    expect(store.data.size).toBe(writes);
  });
  it("retains the last published snapshot when a new generation fails", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    await runInsightJob("me", { db: store.db, now, archiveDays: 1 });
    const previous = structuredClone(
      store.data.get("profileStats/me/snapshots/insights"),
    );
    store.data.get("profileStats/me").updatedAt = "revision-2";
    store.data.get(`profileStats/me/days/${previous.day}`).sleep.score = 20;
    await requestInsightRefresh(store.db, "me", ["2026-02"]);
    store.reject((path) => path.includes("/recordIndexes/"));
    await expect(
      runInsightJob("me", { db: store.db, now, archiveDays: 1 }),
    ).rejects.toThrow("simulated_write_failure");
    expect(store.data.get("profileStats/me/snapshots/insights")).toEqual(
      previous,
    );
    store.reject(null);
    expect(
      (await runInsightJob("me", { db: store.db, now, archiveDays: 1 })).status,
    ).toBe("ready");
  });
  it("does not reuse an incompatible completed draft after exclusions change", async () => {
    const store = memoryFirestore();
    const now = seed(store, 20);
    store.data.set("profileStats/me/snapshots/insights-draft", {
      exclusions: "old",
      rulesVersion: RULES_VERSION,
      baseRevision: null,
      completedMonths: ["2026-01"],
      months: { "2026-01": "nonexistent-stale-month" },
    });
    store.data.get("profiles/me").dataExclusionRanges = [
      { id: "exclude", startDay: "2026-01-20", endDay: "2026-01-20" },
    ];
    expect(
      (await runInsightJob("me", { db: store.db, now, archiveDays: 1 })).status,
    ).toBe("ready");
    const summary = store.data.get("profileStats/me/snapshots/insights");
    expect(summary.day).toBe("2026-01-19");
    expect(summary.months["2026-01"]).not.toBe("nonexistent-stale-month");
  });
  it("removes a deleted last observation from the published record index", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    await runInsightJob("me", { db: store.db, now, archiveDays: 1 });
    const old = store.data.get("profileStats/me/snapshots/insights");
    store.data.delete(`profileStats/me/days/${old.day}`);
    store.data.get("profileStats/me").updatedAt = "revision-2";
    await requestInsightRefresh(store.db, "me", ["2026-02"]);
    await runInsightJob("me", { db: store.db, now, archiveDays: 1 });
    const next = store.data.get("profileStats/me/snapshots/insights");
    expect(
      store.data.get(`profileStats/me/recordIndexes/${next.archiveIndex}`).days[
        old.day
      ],
    ).toBeUndefined();
  });
  it("refuses publication after another worker takes the lease", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    store.onRead((path) => {
      if (
        path === "insightJobs/me" &&
        [...store.data.keys()].some((k) => k.includes("/recordIndexes/"))
      )
        store.data.get(path).lease = "newer-worker";
    });
    const result = await runInsightJob("me", {
      db: store.db,
      now,
      archiveDays: 1,
    });
    expect(result.status).toBe("superseded");
    expect(store.data.has("profileStats/me/snapshots/insights")).toBe(false);
  });
  it("does not read partially persisted source data while an Oura sync owns its lease", async () => {
    const store = memoryFirestore();
    const now = seed(store);
    store.data.set("ouraSyncState/me", {
      leaseUntil: new Date(Date.now() + 60000).toISOString(),
    });
    expect((await runInsightJob("me", { db: store.db, now })).status).toBe(
      "waiting_for_sync",
    );
    expect(store.data.has("profileStats/me/snapshots/insights")).toBe(false);
  });
});
