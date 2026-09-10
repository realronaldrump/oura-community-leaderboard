import crypto from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";
import type { DailyStats, UserProfile } from "../../types.js";
import {
  normalizeMetricDays,
  metricMask,
  localDay,
  exclusionKey,
  shiftDay,
  type MetricCoverage,
  type MetricObservation,
} from "../../domain/metrics.js";
import {
  evaluateHighlights,
  evaluateDailyHighlights,
  RULES_VERSION,
  type HighlightEvent,
  type InsightSummary,
} from "../../domain/records.js";
import { historicalCoverageKey } from "../../domain/coverage.js";
import { getAdminFirestore } from "./firebaseAdmin.js";

export interface PublishedInsights extends InsightSummary {
  months: Record<string, string>;
  archiveBefore: string | null;
  archiveIndex: string;
  peerInputs?: Record<
    string,
    { months: Record<string, string>; exclusions: string }
  >;
}
interface InsightJob {
  dirtyMonths: string[];
  generation?: string;
  requestedAt: string;
  lease?: string | null;
  leaseUntil?: number;
}
const hash = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
export const monthsBetween = (start: string, end: string) => {
  const months: string[] = [];
  let month = `${start.slice(0, 7)}-01`;
  while (month <= end) {
    months.push(month.slice(0, 7));
    const date = new Date(`${month}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    month = date.toISOString().slice(0, 10);
  }
  return months;
};
export async function requestInsightRefresh(
  db: Firestore,
  profileId: string,
  months: string[] = [],
) {
  const ref = db.collection("insightJobs").doc(profileId);
  await db.runTransaction(async (tx) => {
    const previous = (await tx.get(ref)).data() as InsightJob | undefined;
    tx.set(
      ref,
      {
        dirtyMonths: [
          ...new Set([...(previous?.dirtyMonths || []), ...months]),
        ].sort(),
        requestedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}
const emptyStats = (): DailyStats => ({
  sleep: [],
  readiness: [],
  activity: [],
  session: [],
  spo2: [],
  stress: [],
  resilience: [],
  workout: [],
  guidedSession: [],
  cardiovascularAge: [],
  vo2Max: [],
});
async function readMetricMonth(
  db: Firestore,
  profile: UserProfile,
  month: string,
  coverage?: MetricCoverage,
): Promise<MetricObservation[]> {
  const root = db.collection("profileStats").doc(profile.id);
  const start = `${month}-01`;
  const end = shiftDay(
    monthsBetween(start, shiftDay(start, 32))[1] + "-01",
    -1,
  );
  const names = [
    "days",
    "sleepSessions",
    "workouts",
    "guidedSessions",
    "vo2Max",
  ];
  const collections = await Promise.all(
    names.map((name) =>
      root
        .collection(name)
        .where("day", ">=", start)
        .where("day", "<=", end)
        .get(),
    ),
  );
  const stats = emptyStats();
  for (const doc of collections[0].docs) {
    const day = doc.data();
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
      if (day[key]) (stats[key] as unknown[]).push(day[key]);
    if (day.bestSleepSession) stats.session.push(day.bestSleepSession);
  }
  const sessions = collections[1].docs.map((d) => d.data());
  // Raw sessions override denormalized day copies, including corrected/deleted records.
  const rawIds = new Set(sessions.map((s) => s.id));
  stats.session = [
    ...stats.session.filter((s) => !rawIds.has(s.id)),
    ...sessions,
  ] as DailyStats["session"];
  stats.workout = collections[2].docs.map((d) =>
    d.data(),
  ) as DailyStats["workout"];
  stats.guidedSession = collections[3].docs.map((d) => d.data());
  stats.vo2Max = [
    ...(stats.vo2Max || []),
    ...collections[4].docs.map((d) => d.data()),
  ];
  return normalizeMetricDays(stats, profile, { coverage });
}
async function readMonths(
  db: Firestore,
  profileId: string,
  months: Record<string, string>,
) {
  const refs = Object.values(months).map((id) =>
    db
      .collection("profileStats")
      .doc(profileId)
      .collection("metricMonths")
      .doc(id),
  );
  const rows: MetricObservation[] = [];
  for (let i = 0; i < refs.length; i += 50) {
    const snapshots = await db.getAll(...refs.slice(i, i + 50));
    snapshots.forEach((s) => {
      if (!s.exists) throw new Error("incomplete_metric_generation");
      rows.push(...(s.data()?.observations || []));
    });
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}
async function writeDay(
  db: Firestore,
  profileId: string,
  generation: string,
  day: string,
  events: HighlightEvent[],
) {
  const id = `${day}_${generation}_${hash(events)}`;
  const ref = db
    .collection("profileStats")
    .doc(profileId)
    .collection("recordDays")
    .doc(id);
  // Each page stays well below Firestore's document limit. The day manifest is published last.
  const pages: string[] = [];
  for (let i = 0; i < events.length; i += 60) {
    const id = `${day}_${generation}_${String(i / 60).padStart(3, "0")}_${hash(events.slice(i, i + 60))}`;
    await db
      .collection("profileStats")
      .doc(profileId)
      .collection("recordPages")
      .doc(id)
      .set({ events: events.slice(i, i + 60) });
    pages.push(id);
  }
  await ref.set({ day, generation, pages });
  return id;
}
export async function runInsightJob(
  profileId: string,
  options: {
    db?: Firestore;
    budgetMs?: number;
    now?: Date;
    archiveDays?: number;
  } = {},
) {
  const db = options.db || getAdminFirestore();
  const now = options.now || new Date();
  const deadline = Date.now() + (options.budgetMs ?? 12_000);
  const jobRef = db.collection("insightJobs").doc(profileId);
  const root = db.collection("profileStats").doc(profileId);
  const summaryRef = root.collection("snapshots").doc("insights");
  const token = crypto.randomUUID();
  const claimed = await db.runTransaction(async (tx) => {
    const data = (await tx.get(jobRef)).data() as InsightJob | undefined;
    if (data?.leaseUntil && data.leaseUntil > Date.now()) return false;
    tx.set(
      jobRef,
      { lease: token, leaseUntil: Date.now() + 55_000 },
      { merge: true },
    );
    return true;
  });
  if (!claimed) return { status: "busy" };
  try {
    const syncRef = db.collection("ouraSyncState").doc(profileId);
    const [profileDoc, metadataDoc, previousDoc, jobDoc, syncDoc] =
      await Promise.all([
        db.collection("profiles").doc(profileId).get(),
        root.get(),
        summaryRef.get(),
        jobRef.get(),
        syncRef.get(),
      ]);
    if (
      Date.parse(syncDoc.data()?.leaseUntil || "") > Date.now() ||
      (syncDoc.data()?.lastFailureCode &&
        String(syncDoc.data()?.lastFailedAt || "") >
          String(metadataDoc.data()?.updatedAt || ""))
    )
      return { status: "waiting_for_sync" };
    if (!profileDoc.exists || !metadataDoc.exists) return { status: "waiting" };
    const profile = { ...profileDoc.data(), id: profileId } as UserProfile;
    const metadata = metadataDoc.data()!;
    const today = localDay(profile, now);
    const exclusions = exclusionKey(profile);
    const previous = previousDoc.data() as PublishedInsights | undefined;
    const job = jobDoc.data() as InsightJob;
    const fullRebuild =
      !previous ||
      previous.rulesVersion !== RULES_VERSION ||
      previous.exclusions !== exclusions;
    const oldMonths = fullRebuild ? {} : previous.months || {};
    const months = { ...oldMonths };
    const allMonths = monthsBetween(metadata.oldestDay || today, today);
    let dirtyMonths = [
      ...new Set([
        ...(job.dirtyMonths || []),
        ...allMonths.filter((m) => !months[m]),
      ]),
    ].sort();
    // Resume the unpublished draft after a bounded invocation.
    const draftDoc = await root
      .collection("snapshots")
      .doc("insights-draft")
      .get();
    const draft = draftDoc.data();
    const draftMatches =
      draft?.exclusions === exclusions &&
      draft?.rulesVersion === RULES_VERSION &&
      draft?.baseRevision === (previous?.revision || null);
    const newRequest = (draft?.requestedAt || "") !== (job.requestedAt || "");
    const completedMonths = new Set<string>(
      draftMatches
        ? (draft?.completedMonths || []).filter(
            (m: string) => !newRequest || !(job.dirtyMonths || []).includes(m),
          )
        : [],
    );
    if (draftMatches)
      for (const m of completedMonths)
        if (draft?.months?.[m]) months[m] = draft.months[m];
    dirtyMonths = dirtyMonths.filter((m) => !completedMonths.has(m));
    let earliestChanged = draftMatches
      ? draft?.earliestChanged || today
      : today;
    for (const month of dirtyMonths) {
      if (Date.now() > deadline - 2500) break;
      const observations = await readMetricMonth(
        db,
        profile,
        month,
        metadata.sourceCoverage,
      );
      const id = `${month}_${hash(observations)}`;
      if (oldMonths[month] !== id) {
        const oldDocument = oldMonths[month]
          ? await root.collection("metricMonths").doc(oldMonths[month]).get()
          : null;
        const oldRows = new Map<string, MetricObservation>(
          (oldDocument?.data()?.observations || []).map(
            (o: MetricObservation) => [o.day, o],
          ),
        );
        const newRows = new Map(observations.map((o) => [o.day, o]));
        for (const changedDay of new Set([
          ...oldRows.keys(),
          ...newRows.keys(),
        ]))
          if (
            hash(oldRows.get(changedDay) || null) !==
              hash(newRows.get(changedDay) || null) &&
            changedDay < earliestChanged
          )
            earliestChanged = changedDay;
      }
      await root
        .collection("metricMonths")
        .doc(id)
        .set({ month, observations });
      months[month] = id;
      completedMonths.add(month);
    }
    const remaining = dirtyMonths.filter((m) => !completedMonths.has(m));
    if (remaining.length) {
      await root
        .collection("snapshots")
        .doc("insights-draft")
        .set({
          months,
          completedMonths: [...completedMonths],
          earliestChanged,
          exclusions,
          rulesVersion: RULES_VERSION,
          baseRevision: previous?.revision || null,
          requestedAt: job.requestedAt || "",
        });
      return { status: "building", remainingMonths: remaining.length };
    }
    const observations = await readMonths(db, profileId, months);
    const day = observations.filter((o) => o.day <= today).at(-1)?.day || today;
    const coverage: MetricCoverage = metadata.sourceCoverage || {};
    const peers: Array<{
      profileId: string;
      observations: MetricObservation[];
    }> = [];
    const peerInputs: NonNullable<PublishedInsights["peerInputs"]> = {};
    const profiles = await db.collection("profiles").get();
    for (const peer of profiles.docs.filter((p) => p.id !== profileId)) {
      const peerSummary = (
        await db
          .collection("profileStats")
          .doc(peer.id)
          .collection("snapshots")
          .doc("insights")
          .get()
      ).data() as PublishedInsights | undefined;
      if (
        peerSummary &&
        peerSummary.exclusions === exclusionKey(peer.data() as UserProfile)
      ) {
        const peerObservations = await readMonths(
          db,
          peer.id,
          peerSummary.months,
        );
        peers.push({ profileId: peer.id, observations: peerObservations });
        peerInputs[peer.id] = {
          months: peerSummary.months,
          exclusions: peerSummary.exclusions,
        };
        const prior = previous?.peerInputs?.[peer.id];
        if (!prior || prior.exclusions !== peerSummary.exclusions)
          earliestChanged = observations[0]?.day || day;
        else if (hash(prior.months) !== hash(peerSummary.months)) {
          const priorObservations = await readMonths(db, peer.id, prior.months);
          const oldRows = new Map(priorObservations.map((o) => [o.day, o]));
          const newRows = new Map(peerObservations.map((o) => [o.day, o]));
          for (const d of new Set([...oldRows.keys(), ...newRows.keys()]))
            if (
              hash(oldRows.get(d) || null) !== hash(newRows.get(d) || null) &&
              d < earliestChanged
            )
              earliestChanged = d;
        }
      }
    }
    if (Object.keys(previous?.peerInputs || {}).some((id) => !peerInputs[id]))
      earliestChanged = observations[0]?.day || day;
    const revision = hash({
      months,
      exclusions,
      rules: RULES_VERSION,
      coverage,
      peerInputs,
    });
    const changed = revision !== previous?.revision;
    const coverageChanged =
      historicalCoverageKey(previous?.coverage || {}) !==
      historicalCoverageKey(coverage);
    const historicalChange =
      fullRebuild ||
      coverageChanged ||
      (changed && earliestChanged < shiftDay(today, -35));
    const generation = historicalChange
      ? revision
      : previous?.generation || revision;
    let archiveBefore = historicalChange
      ? shiftDay(day, -1)
      : (previous?.archiveBefore ?? null);
    const priorEvents =
      previous?.exclusions === exclusions ? previous.recent || [] : [];
    const previousIndex = previous?.archiveIndex
      ? (
          await root
            .collection("recordIndexes")
            .doc(previous.archiveIndex)
            .get()
        ).data() || {}
      : {};
    const recordDays: Record<string, string> = historicalChange
      ? {}
      : { ...(previousIndex.days || {}) };
    const metricMasks: Record<string, string> = historicalChange
      ? {}
      : { ...(previousIndex.metricMasks || {}) };
    if (changed)
      for (const d of Object.keys(recordDays))
        if (d >= earliestChanged) {
          delete recordDays[d];
          delete metricMasks[d];
        }
    const evaluated = evaluateDailyHighlights({
      profileId,
      observations,
      asOfDay: day,
      today,
      coverage,
      peers,
      priorEvents: previousIndex.cooldowns || priorEvents,
      revision,
    });
    recordDays[day] = await writeDay(
      db,
      profileId,
      generation,
      day,
      evaluated.events,
    );
    metricMasks[day] = metricMask(evaluated.events.map((e) => e.metricId));
    if (evaluated.completedDay) {
      recordDays[evaluated.completedDay] = await writeDay(
        db,
        profileId,
        generation,
        evaluated.completedDay,
        evaluated.completedEvents,
      );
      metricMasks[evaluated.completedDay] = metricMask(
        evaluated.completedEvents.map((e) => e.metricId),
      );
      if (archiveBefore === evaluated.completedDay)
        archiveBefore = observations.some(
          (o) => o.day < evaluated.completedDay!,
        )
          ? shiftDay(evaluated.completedDay, -1)
          : null;
    }
    const recent = [
      ...evaluated.events,
      ...evaluated.completedEvents,
      ...priorEvents.filter(
        (e) =>
          e.day < day &&
          e.day >= shiftDay(day, -7) &&
          (!changed || e.day < earliestChanged),
      ),
    ].slice(0, 24);
    // Corrections in the recent month are replayed, not merely appended to today's findings.
    const replayStart = changed && !historicalChange ? earliestChanged : day;
    const replayDays = observations
      .map((o) => o.day)
      .filter((d) => d < day && d >= replayStart)
      .reverse();
    const backlogDays = archiveBefore
      ? observations
          .map((o) => o.day)
          .filter((d) => d <= archiveBefore!)
          .reverse()
      : [];
    const workDays = [...new Set([...replayDays, ...backlogDays])];
    let processed = 0;
    for (const eventDay of workDays) {
      if (
        processed >= (options.archiveDays ?? 7) ||
        Date.now() > deadline - 1500
      )
        break;
      const result = evaluateHighlights({
        profileId,
        observations,
        asOfDay: eventDay,
        today,
        coverage,
        peers,
        revision,
      });
      recordDays[eventDay] = await writeDay(
        db,
        profileId,
        generation,
        eventDay,
        result.events,
      );
      metricMasks[eventDay] = metricMask(result.events.map((e) => e.metricId));
      if (eventDay >= shiftDay(day, -7)) recent.push(...result.events);
      if (archiveBefore && eventDay <= archiveBefore)
        archiveBefore = observations.some((o) => o.day < eventDay)
          ? shiftDay(eventDay, -1)
          : null;
      processed++;
    }
    const unfinishedReplay = replayDays.filter(
      (d) => !workDays.slice(0, processed).includes(d),
    );
    if (unfinishedReplay.length)
      archiveBefore =
        [archiveBefore, unfinishedReplay[0]].filter(Boolean).sort().at(-1) ||
        null;
    const cooldownMap = new Map<string, any>();
    for (const e of [...(previousIndex.cooldowns || []), ...evaluated.events]) {
      if (e.day < shiftDay(day, -7) || e.day > day) continue;
      const key = `${e.metricId}:${e.family}:${e.direction}`;
      const old = cooldownMap.get(key);
      if (!old || old.day <= e.day)
        cooldownMap.set(key, {
          metricId: e.metricId,
          family: e.family,
          direction: e.direction,
          day: e.day,
          value: e.value,
          evidence: { rank: e.evidence.rank },
        });
    }
    const cooldowns = [...cooldownMap.values()];
    const archiveIndex = hash({ recordDays, metricMasks, cooldowns });
    await root
      .collection("recordIndexes")
      .doc(archiveIndex)
      .set({ days: recordDays, metricMasks, cooldowns });
    const summary: PublishedInsights = {
      profileId,
      day,
      generatedAt: now.toISOString(),
      rulesVersion: RULES_VERSION,
      revision,
      exclusions,
      generation,
      status: "ready",
      featured: evaluated.featured,
      recent: recent.slice(0, 36),
      coverage,
      months,
      archiveBefore,
      archiveIndex,
      peerInputs,
      archiveThrough: archiveBefore
        ? shiftDay(archiveBefore, 1)
        : observations[0]?.day || day,
    };
    // A correction or profile edit racing this work must never replace the newer input generation.
    const published = await db.runTransaction(async (tx) => {
      const [
        latestProfile,
        latestMetadata,
        latestJob,
        latestSummary,
        latestSync,
      ] = await Promise.all([
        tx.get(db.collection("profiles").doc(profileId)),
        tx.get(root),
        tx.get(jobRef),
        tx.get(summaryRef),
        tx.get(syncRef),
      ]);
      for (const [id, input] of Object.entries(peerInputs)) {
        const [peerProfile, peerSnapshot] = await Promise.all([
          tx.get(db.collection("profiles").doc(id)),
          tx.get(
            db
              .collection("profileStats")
              .doc(id)
              .collection("snapshots")
              .doc("insights"),
          ),
        ]);
        if (
          !peerProfile.exists ||
          exclusionKey(peerProfile.data() as UserProfile) !==
            input.exclusions ||
          hash(peerSnapshot.data()?.months || {}) !== hash(input.months)
        )
          return false;
      }
      if (Date.parse(latestSync.data()?.leaseUntil || "") > Date.now())
        return false;
      if (latestSummary.data()?.archiveIndex !== previous?.archiveIndex)
        return false;
      if (
        latestMetadata.data()?.updatedAt !== metadata.updatedAt ||
        exclusionKey(latestProfile.data() as UserProfile) !== exclusions ||
        latestJob.data()?.requestedAt !== job.requestedAt ||
        latestJob.data()?.lease !== token ||
        latestProfile.data()?.lastKnownUtcOffsetMinutes !==
          profile.lastKnownUtcOffsetMinutes
      )
        return false;
      tx.set(summaryRef, summary);
      tx.set(
        jobRef,
        {
          dirtyMonths: [],
          lastSuccessfulAt: now.toISOString(),
          lastError: null,
          archiveBefore,
        },
        { merge: true },
      );
      tx.delete(root.collection("snapshots").doc("insights-draft"));
      return true;
    });
    return {
      status: published ? "ready" : "superseded",
      metricDays: observations.length,
      featured: evaluated.featured.length,
      archiveBefore,
    };
  } catch (error) {
    await jobRef.set(
      {
        lastError:
          error instanceof Error ? error.message : "insight_generation_failed",
        lastFailedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    throw error;
  } finally {
    await db.runTransaction(async (tx) => {
      const latest = await tx.get(jobRef);
      if (latest.data()?.lease === token)
        tx.set(jobRef, { lease: null, leaseUntil: 0 }, { merge: true });
    });
  }
}
export async function reconcileInsights(
  options: {
    db?: Firestore;
    budgetMs?: number;
    profileId?: string;
    archiveDays?: number;
  } = {},
) {
  const db = options.db || getAdminFirestore();
  const deadline = Date.now() + (options.budgetMs || 45_000);
  const profiles = await db.collection("profiles").get();
  const result: unknown[] = [];
  for (const profile of profiles.docs.filter(
    (p) => !options.profileId || p.id === options.profileId,
  )) {
    if (Date.now() > deadline - 3000) break;
    result.push({
      profileId: profile.id,
      ...(await runInsightJob(profile.id, {
        db,
        budgetMs: Math.min(20_000, deadline - Date.now()),
        archiveDays: options.archiveDays,
      })),
    });
  }
  return result;
}
