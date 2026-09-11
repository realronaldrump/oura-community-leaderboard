import { expect, it } from "vitest";
import { readPublishedRecordRankings } from "../api/_lib/recordRankings";
import { evaluateHighlights } from "../domain/records";
import { shiftDay } from "../domain/metrics";
let fixtureId = 0;
function fixture() {
  const profileId = `ranking-test-${++fixtureId}`;
  const observations = Array.from({ length: 100 }, (_, i) => ({ day: shiftDay("2025-01-01", i), values: { sleep_score: i === 99 ? 97 : i === 0 ? 99 : i === 1 ? 98 : 50 + i % 40 }, sources: {} }));
  const event = evaluateHighlights({ profileId, observations, asOfDay: observations.at(-1)!.day, metricIds: ["sleep_score"] }).events.find(e => e.family === "daily" && e.direction === "high" && e.evidence.windowDays == null)!;
  const root = `profileStats/${profileId}`;
  const data = new Map<string, any>([
    [`profiles/${profileId}`, { id: profileId }],
    [`${root}/snapshots/insights`, { profileId, revision: "revision", archiveIndex: "index", exclusions: "[]", featured: [], recent: [], months: { "2025-01": "month" } }],
    [`${root}/metricMonths/month`, { observations }],
    [`${root}/recordIndexes/index`, { days: { [event.day]: "manifest" } }],
    [`${root}/recordDays/manifest`, { pages: ["page"] }],
    [`${root}/recordPages/page`, { events: [event] }],
  ]);
  const reads: string[] = [];
  const snapshot = (path: string) => { reads.push(path); return { exists: data.has(path), data: () => structuredClone(data.get(path)) }; };
  const doc = (path: string): any => ({ path, get: async () => snapshot(path), collection: (name: string) => collection(`${path}/${name}`) });
  const collection = (path: string): any => ({ doc: (id: string) => doc(`${path}/${id}`) });
  const db: any = { collection, getAll: async (...refs: any[]) => refs.map(ref => snapshot(ref.path)) };
  return { db, data, root, reads, input: { profileId, eventId: event.id }, event };
}
it("pages exact historical ranks from compact projections without reading raw data", async () => {
  const f = fixture();
  const first = await readPublishedRecordRankings(f.db, f.input);
  expect(first.rows).toHaveLength(20);
  expect(first.total).toBe(100);
  expect(first.nearby.slice(0, 3).map(r => [r.rank, r.value])).toEqual([[1,99],[2,98],[3,97]]);
  expect(first.nearby.find(r => r.selected)?.rank).toBe(3);
  const next = await readPublishedRecordRankings(f.db, { ...f.input, offset: first.nextOffset!, revision: first.revision });
  expect(next.rows[0].position).toBe(20);
  expect(next.rows.some(r => first.rows.some(old => old.position === r.position))).toBe(false);
  expect(f.reads.some(path => /\/(days|sleepSessions|heartRateDays)\//.test(path))).toBe(false);
  f.data.get(`${f.root}/snapshots/insights`).archiveIndex = "backfilled-other-days";
  await expect(readPublishedRecordRankings(f.db, { ...f.input, offset: 40, revision: first.revision })).resolves.toMatchObject({ revision: first.revision });
});
it("rejects mixed publication pages, changed exclusions, and malformed requests", async () => {
  const f = fixture();
  const first = await readPublishedRecordRankings(f.db, f.input);
  f.data.get(`${f.root}/snapshots/insights`).revision = "corrected-metric-inputs";
  await expect(readPublishedRecordRankings(f.db, { ...f.input, offset: 20, revision: first.revision })).rejects.toMatchObject({ status: 409, message: "rankings_updated" });
  f.data.get(`profiles/${f.input.profileId}`).dataExclusionRanges = [{ id: "x", startDay: f.event.day, endDay: f.event.day }];
  await expect(readPublishedRecordRankings(f.db, f.input)).rejects.toMatchObject({ status: 409, message: "rankings_preparing" });
  await expect(readPublishedRecordRankings(f.db, { ...f.input, profileId: "profiles/secret" })).rejects.toMatchObject({ status: 400 });
});
it("refuses mismatching evidence rather than showing a contradictory ranking", async () => {
  const f = fixture();
  f.data.get(`${f.root}/recordPages/page`).events[0].evidence.rank = 1;
  await expect(readPublishedRecordRankings(f.db, f.input)).rejects.toMatchObject({ status: 409, message: "rankings_preparing" });
});
