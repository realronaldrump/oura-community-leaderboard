import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import type { DailyStats } from "../types";
import { hasMetricInMask, type MetricObservation } from "../domain/metrics";
import type { HighlightEvent, InsightSummary } from "../domain/records";
export interface PublishedInsights extends InsightSummary {
  months: Record<string, string>;
  archiveBefore: string | null;
  archiveIndex: string;
  peerInputs?: Record<
    string,
    { months: Record<string, string>; exclusions: string }
  >;
}
export const readInsightSummary = async (
  profileId: string,
): Promise<PublishedInsights | null> => {
  const result = await getDoc(
    doc(db, "profileStats", profileId, "snapshots", "insights"),
  );
  return result.exists() ? (result.data() as PublishedInsights) : null;
};
export const subscribeInsights = (
  profileId: string,
  callback: (value: PublishedInsights | null) => void,
  onError: (error: Error) => void,
) =>
  onSnapshot(
    doc(db, "profileStats", profileId, "snapshots", "insights"),
    (snapshot) =>
      callback(
        snapshot.exists() ? (snapshot.data() as PublishedInsights) : null,
      ),
    onError,
  );
const monthCache = new Map<string, Promise<MetricObservation[]>>();
export async function readMetricHistory(
  profileId: string,
  months: Record<string, string>,
  start?: string,
  end?: string,
): Promise<MetricObservation[]> {
  const selected = Object.entries(months).filter(
    ([month]) =>
      (!start || month >= start.slice(0, 7)) &&
      (!end || month <= end.slice(0, 7)),
  );
  const result = await Promise.all(
    selected.map(([, id]) => {
      const key = `${profileId}/${id}`;
      if (!monthCache.has(key))
        monthCache.set(
          key,
          getDoc(doc(db, "profileStats", profileId, "metricMonths", id))
            .then((result) => {
              if (!result.exists())
                throw new Error("Metric history is still being prepared.");
              return result.data().observations as MetricObservation[];
            })
            .catch((error) => {
              monthCache.delete(key);
              throw error;
            }),
        );
      return monthCache.get(key)!;
    }),
  );
  return result
    .flat()
    .filter((o) => (!start || o.day >= start) && (!end || o.day <= end))
    .sort((a, b) => a.day.localeCompare(b.day));
}
export async function readRecordPage(
  profileId: string,
  archiveIndex: string,
  before?: string,
  metricIds: string[] = [],
): Promise<{ events: HighlightEvent[]; cursor?: string }> {
  const index = await getDoc(
    doc(db, "profileStats", profileId, "recordIndexes", archiveIndex),
  );
  const pointers = (index.data()?.days || {}) as Record<string, string>;
  const days = Object.keys(pointers)
    .filter(
      (day) =>
        (!before || day < before) &&
        (!metricIds.length ||
          !index.data()?.metricMasks?.[day] ||
          hasMetricInMask(index.data()!.metricMasks[day], metricIds)),
    )
    .sort()
    .reverse();
  const selected = days.slice(0, 3);
  const manifests = await Promise.all(
    selected.map((day) =>
      getDoc(doc(db, "profileStats", profileId, "recordDays", pointers[day])),
    ),
  );
  const result = await Promise.all(
    manifests
      .flatMap((r) => r.data()?.pages || [])
      .map((id) =>
        getDoc(doc(db, "profileStats", profileId, "recordPages", id)),
      ),
  );
  return {
    events: result
      .flatMap((r) => r.data()?.events || [])
      .filter((e) => !metricIds.length || metricIds.includes(e.metricId))
      .sort((a, b) => b.day.localeCompare(a.day) || b.score - a.score),
    cursor: days.length > selected.length ? selected.at(-1) : undefined,
  };
}
export async function readRecordEvent(
  profileId: string,
  archiveIndex: string,
  eventId: string,
): Promise<HighlightEvent | null> {
  const day = eventId.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!day) return null;
  const index = await getDoc(
    doc(db, "profileStats", profileId, "recordIndexes", archiveIndex),
  );
  const id = index.data()?.days?.[day];
  if (!id) return null;
  const manifest = await getDoc(
    doc(db, "profileStats", profileId, "recordDays", id),
  );
  const pages = await Promise.all(
    (manifest.data()?.pages || []).map((id: string) =>
      getDoc(doc(db, "profileStats", profileId, "recordPages", id)),
    ),
  );
  return (
    pages
      .flatMap((p) => p.data()?.events || [])
      .find((e) => e.id === eventId) || null
  );
}
export async function readDayDetail(
  profileId: string,
  day: string,
): Promise<DailyStats> {
  const root = collection(db, "profileStats", profileId, "days");
  const [
    record,
    sessions,
    workouts,
    guided,
    tags,
    enhancedTags,
    heartRates,
    sleepTime,
  ] = await Promise.all([
    getDoc(doc(root, day)),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "sleepSessions"),
        where("day", "==", day),
      ),
    ),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "workouts"),
        where("day", "==", day),
      ),
    ),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "guidedSessions"),
        where("day", "==", day),
      ),
    ),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "tags"),
        where("day", "==", day),
      ),
    ),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "enhancedTags"),
        where("day", "==", day),
      ),
    ),
    getDoc(doc(db, "profileStats", profileId, "heartRateDays", day)),
    getDocs(
      query(
        collection(db, "profileStats", profileId, "sleepTime"),
        where("day", "==", day),
      ),
    ),
  ]);
  const data = record.data() || {};
  const stats: DailyStats = {
    sleep: [],
    readiness: [],
    activity: [],
    session: [],
    spo2: [],
    stress: [],
    resilience: [],
  };
  for (const key of [
    "sleep",
    "readiness",
    "activity",
    "spo2",
    "stress",
    "resilience",
    "cardiovascularAge",
    "vo2Max",
  ] as const)
    if (data[key])
      (stats as unknown as Record<string, unknown>)[key] = [data[key]];
  stats.session = sessions.docs.map((d) => d.data()) as DailyStats["session"];
  if (!stats.session.length && data.bestSleepSession)
    stats.session = [data.bestSleepSession];
  stats.workout = workouts.docs.map((d) => d.data()) as DailyStats["workout"];
  stats.guidedSession = guided.docs.map((d) => d.data());
  stats.tag = tags.docs.map((d) => d.data());
  stats.enhancedTag = enhancedTags.docs.map((d) => d.data());
  stats.heartrate = heartRates.data()?.items || [];
  stats.sleepTime = sleepTime.docs.map((d) => d.data());
  return stats;
}
