import type { Firestore } from "firebase-admin/firestore";
import type { UserProfile } from "../../types.js";
import { exclusionKey, METRIC_BY_ID, type MetricObservation } from "../../domain/metrics.js";
import { rankRecordHistory, surroundingRankings, type HighlightEvent, type RecordRankingRow } from "../../domain/records.js";
import type { PublishedInsights } from "./insightsProjection.js";

export interface RecordRankingPage {
  event: HighlightEvent;
  revision: string;
  total: number;
  nearby: RecordRankingRow[];
  rows: RecordRankingRow[];
  nextOffset: number | null;
}
const cache = new Map<string, { event: HighlightEvent; rows: RecordRankingRow[] }>();
const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
const loadMonths = async (db: Firestore, profileId: string, months: Record<string, string>, end: string) => {
  const refs = Object.entries(months).filter(([month]) => month <= end.slice(0, 7))
    .map(([, id]) => db.collection("profileStats").doc(profileId).collection("metricMonths").doc(id));
  const observations: MetricObservation[] = [];
  for (let i = 0; i < refs.length; i += 24) {
    const docs = await db.getAll(...refs.slice(i, i + 24));
    for (const doc of docs) {
      if (!doc.exists) fail("rankings_preparing");
      observations.push(...(doc.data()?.observations || []));
    }
  }
  return observations.filter(o => o.day <= end).sort((a, b) => a.day.localeCompare(b.day));
};

/** Read-only, bounded pages from published metric projections; never raw sample streams. */
export async function readPublishedRecordRankings(db: Firestore, input: {
  profileId: string; eventId: string; offset?: number; revision?: string;
}): Promise<RecordRankingPage> {
  const { profileId, eventId, revision: expectedRevision } = input;
  const offset = input.offset ?? 0;
  if (typeof profileId !== "string" || !/^[^/]{1,128}$/.test(profileId) ||
      typeof eventId !== "string" || eventId.length > 768 || !eventId.startsWith(`${profileId}:`) ||
      !Number.isSafeInteger(offset) || offset < 0) fail("invalid_record_request", 400);
  const root = db.collection("profileStats").doc(profileId);
  const profileRef = db.collection("profiles").doc(profileId);
  const summaryRef = root.collection("snapshots").doc("insights");
  const [profileDoc, summaryDoc] = await Promise.all([profileRef.get(), summaryRef.get()]);
  const summary = summaryDoc.data() as PublishedInsights | undefined;
  if (!profileDoc.exists || !summary) fail("rankings_preparing");
  if (summary.exclusions !== exclusionKey(profileDoc.data() as UserProfile)) fail("rankings_preparing");
  // Archive backfill can add other dates without changing this ranking's inputs.
  const revision = summary.revision;
  if (expectedRevision && expectedRevision !== revision) fail("rankings_updated");
  const key = `${profileId}:${revision}:${eventId}`;
  let found = cache.get(key);
  if (!found) {
    let event = [...summary.featured, ...summary.recent].find(e => e.id === eventId);
    if (!event) {
      const day = eventId.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const index = await root.collection("recordIndexes").doc(summary.archiveIndex).get();
      const id = day && index.data()?.days?.[day];
      if (!id) fail("record_not_found", 404);
      const manifest = await root.collection("recordDays").doc(id).get();
      for (const id of manifest.data()?.pages || []) {
        const page = await root.collection("recordPages").doc(id).get();
        event = (page.data()?.events || []).find((e: HighlightEvent) => e.id === eventId);
        if (event) break;
      }
    }
    if (!event || event.profileId !== profileId || !METRIC_BY_ID[event.metricId]) fail("record_not_found", 404);
    const peerInput = event.peerId && summary.peerInputs?.[event.peerId];
    if (event.peerId && !peerInput) fail("rankings_preparing");
    const [observations, peers] = await Promise.all([
      loadMonths(db, profileId, summary.months, event.day),
      event.peerId && peerInput ? loadMonths(db, event.peerId, peerInput.months, event.day) : Promise.resolve([]),
    ]);
    const rows = rankRecordHistory(event, observations, peers);
    const selected = rows.find(row => row.selected);
    const expectedValue = event.family === "friend_close" ? Math.abs(event.value) : event.value;
    if (!selected || rows.length !== event.evidence.sampleCount || selected.rank !== event.evidence.rank ||
        Math.abs(selected.value - expectedValue) > METRIC_BY_ID[event.metricId].resolution / 100)
      fail("rankings_preparing");
    found = { event, rows };
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    cache.set(key, found);
  }
  if (found.event.peerId) {
    const peer = await db.collection("profiles").doc(found.event.peerId).get();
    if (!peer.exists || summary.peerInputs?.[found.event.peerId]?.exclusions !== exclusionKey(peer.data() as UserProfile))
      fail("rankings_preparing");
  }
  const [currentProfile, currentSummary] = await Promise.all([profileRef.get(), summaryRef.get()]);
  if (!currentProfile.exists || exclusionKey(currentProfile.data() as UserProfile) !== summary.exclusions ||
      currentSummary.data()?.revision !== summary.revision) fail("rankings_updated");
  const end = offset + 20;
  return { event: found.event, revision, total: found.rows.length, nearby: surroundingRankings(found.rows),
    rows: found.rows.slice(offset, end), nextOffset: end < found.rows.length ? end : null };
}
