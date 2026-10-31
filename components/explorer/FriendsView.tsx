import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Swords, UserPlus } from "lucide-react";
import { Button, Dialog } from "../ui";
import type { UserProfile } from "../../types";
import {
  METRICS,
  METRIC_BY_ID,
  formatMetricValue,
  metricColor,
  metricSeries,
  filterMetricObservationsForProfile,
  exclusionKey,
  shiftDay,
  type MetricObservation,
} from "../../domain/metrics";
import {
  readInsightSummary,
  readMetricHistory,
  type PublishedInsights,
} from "../../services/insightsService";
import { navigate } from "../../hooks/useAppRoute";
import { getProfileDisplayName } from "../../utils/profileName";
import MetricChart from "./MetricChart";
interface FriendData {
  profile: UserProfile;
  observations: MetricObservation[];
}
const SCORE_IDS = ["sleep_score", "readiness_score", "activity_score"];
const shortLabel = (id: string) => METRIC_BY_ID[id].label.replace(" score", "");
const firstName = (profile: UserProfile) =>
  profile.firstName || getProfileDisplayName(profile).split(" ")[0] || "Friend";
export default function FriendsView({
  activeProfile,
  friends,
  summary,
  day,
  onInvite,
}: {
  activeProfile: UserProfile;
  friends: FriendData[];
  summary: PublishedInsights | null;
  day: string;
  onInvite: () => void;
}) {
  const [metricId, setMetricId] = useState("sleep_score");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [moreMetrics, setMoreMetrics] = useState(false);
  const comparison = useRef<HTMLElement>(null);
  const metric = METRIC_BY_ID[metricId];
  const peer = friends.find((f) => f.profile.id === peerId);
  const own = friends.find((f) => f.profile.id === activeProfile.id);
  useEffect(() => {
    if (peerId)
      comparison.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [peerId]);
  const peerSummary = useQuery({
    queryKey: ["insights", peerId],
    queryFn: () => readInsightSummary(peerId!),
    enabled: Boolean(peerId),
    staleTime: 60_000,
  });
  const histories = useQuery({
    queryKey: [
      "friend-history",
      activeProfile.id,
      peerId,
      summary?.revision,
      peerSummary.data?.revision,
      exclusionKey(activeProfile),
      peer ? exclusionKey(peer.profile) : null,
      day,
    ],
    queryFn: async () => {
      const start = shiftDay(day, -29);
      return Promise.all([
        summary
          ? readMetricHistory(activeProfile.id, summary.months, start, day)
          : Promise.resolve(own?.observations || []),
        peerSummary.data && peer && peerSummary.data.exclusions === exclusionKey(peer.profile)
          ? readMetricHistory(peerId!, peerSummary.data.months, start, day)
          : Promise.resolve(peer?.observations || []),
      ]);
    },
    enabled: Boolean(peer),
    staleTime: 60_000,
  });
  const ranked = useMemo(
    () =>
      friends
        .map((f) => {
          const values = f.observations.find((o) => o.day === day)?.values || {};
          return { ...f, values, value: values[metricId] as number | undefined };
        })
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [friends, metricId, day],
  );
  const pointsA = metricSeries(
    filterMetricObservationsForProfile(histories.data?.[0] || own?.observations || [], activeProfile),
    metricId,
    shiftDay(day, -29),
    day,
  );
  const pointsB = metricSeries(
    filterMetricObservationsForProfile(histories.data?.[1] || peer?.observations || [], peer?.profile || {}),
    metricId,
    shiftDay(day, -29),
    day,
  );
  const matchedDays = new Set(
    pointsA
      .filter((p) => pointsB.some((q) => q.day === p.day))
      .map((p) => p.day),
  );
  const peerName = peer ? firstName(peer.profile) : "";
  return (
    <div>
      <header className="page-heading">
        <h1>Friends</h1>
      </header>
      <div className="friends-actions">
        <Button variant="secondary" size="sm" onClick={onInvite}>
          <UserPlus size={16} aria-hidden="true" /> Invite
        </Button>
        <button
          type="button"
          className="text-action"
          onClick={() => navigate("/friends/challenges")}
        >
          <Swords size={17} aria-hidden="true" /> Challenges <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="score-selector" role="group" aria-label="Compare scores">
        {SCORE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={metricId === id}
            onClick={() => setMetricId(id)}
          >
            {shortLabel(id)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={!SCORE_IDS.includes(metricId)}
          onClick={() => setMoreMetrics(true)}
        >
          More
        </button>
      </div>
      <section className="friends-board" aria-labelledby="leaderboard-title">
        <div className="section-title">
          <h2 id="leaderboard-title">{metric.label}</h2>
          <span>
            {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
        <div className="friend-list">
          {ranked.map((f) => {
            const rank =
              f.value == null
                ? null
                : ranked.filter(
                    (other) => other.value != null && other.value > f.value!,
                  ).length + 1;
            const self = f.profile.id === activeProfile.id;
            const others = SCORE_IDS.filter((id) => id !== metricId && f.values[id] != null)
              .map((id) => `${shortLabel(id)} ${formatMetricValue(id, f.values[id])}`)
              .join(" · ");
            return (
              <button
                type="button"
                className={`friend-row ${self ? "friend-row--you" : ""}`}
                key={f.profile.id}
                aria-pressed={self ? undefined : peerId === f.profile.id}
                onClick={() =>
                  self
                    ? navigate(`/metrics/${metricId}?day=${day}`)
                    : setPeerId(peerId === f.profile.id ? null : f.profile.id)
                }
              >
                <span className="friend-rank">{rank || "–"}</span>
                <span className="friend-avatar" aria-hidden="true">
                  {firstName(f.profile).charAt(0).toUpperCase()}
                </span>
                <span className="friend-name">
                  <strong>
                    {getProfileDisplayName(f.profile)}
                    {self ? " (you)" : ""}
                  </strong>
                  <small>
                    {f.value == null
                      ? "No data for this day"
                      : others || (self ? "Your history" : "Compare")}
                  </small>
                </span>
                <strong className="friend-value">
                  {formatMetricValue(metric, f.value)}
                </strong>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
      {friends.length < 2 && (
        <div className="quiet-state">
          <UserPlus size={28} aria-hidden="true" />
          <h2>Just you so far</h2>
          <p>Invite a friend to compare scores each day.</p>
          <Button onClick={onInvite}>Invite a friend</Button>
        </div>
      )}
      {peer && (
        <section className="detail-section h2h" ref={comparison} aria-labelledby="h2h-title">
          <div className="section-title">
            <h2 id="h2h-title">You vs {peerName}</h2>
            <button
              type="button"
              className="text-action"
              onClick={() => setPeerId(null)}
            >
              Close
            </button>
          </div>
          <div className="chart-surface">
            <MetricChart
              metric={metric}
              series={[
                {
                  label: "You",
                  color: metricColor("recovery"),
                  points: pointsA.filter((p) => matchedDays.has(p.day)),
                },
                {
                  label: peerName,
                  color: metricColor("sleep"),
                  points: pointsB.filter((p) => matchedDays.has(p.day)),
                },
              ]}
            />
            <p className="fine-print">
              Last 30 days · {matchedDays.size} {matchedDays.size === 1 ? "day" : "days"} you both recorded
            </p>
          </div>
          <div className="comparison-details list-panel">
            <div className="comparison-metric" aria-hidden="true">
              <h3>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</h3>
              <small>You</small>
              <small>{peerName}</small>
            </div>
            {[
              "sleep_duration",
              "efficiency",
              "hrv",
              "lowest_hr",
              "steps",
              "active_calories",
            ].map((id) => {
              const m = METRIC_BY_ID[id];
              const yours = own?.observations.find((o) => o.day === day)
                ?.values[id];
              const theirs = peer.observations.find((o) => o.day === day)
                ?.values[id];
              return (
                <div className="comparison-metric" key={id}>
                  <h3>{m.label}</h3>
                  <button
                    type="button"
                    aria-label={`Your ${m.label.toLowerCase()}: ${formatMetricValue(m, yours)}`}
                    onClick={() =>
                      navigate(
                        `/metrics/${id}?profile=${activeProfile.id}&day=${day}`,
                      )
                    }
                  >
                    <strong>{formatMetricValue(m, yours)}</strong>
                  </button>
                  <button
                    type="button"
                    aria-label={`${peerName}’s ${m.label.toLowerCase()}: ${formatMetricValue(m, theirs)}`}
                    onClick={() =>
                      navigate(
                        `/metrics/${id}?profile=${peer.profile.id}&day=${day}`,
                      )
                    }
                  >
                    <strong>{formatMetricValue(m, theirs)}</strong>
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="text-action"
            onClick={() =>
              navigate(
                `/metrics/${metricId}?profile=${peer.profile.id}&day=${day}`,
              )
            }
          >
            {peerName}’s {metric.label.toLowerCase()} history <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
      <Dialog
        isOpen={moreMetrics}
        title="Compare by"
        onClose={() => setMoreMetrics(false)}
      >
        <div className="metric-list">
          {METRICS.filter((m) => m.comparison === "direct" && m.recordable).map(
            (m) => (
              <button
                type="button"
                className="metric-row"
                key={m.id}
                aria-current={m.id === metricId ? "true" : undefined}
                onClick={() => {
                  setMetricId(m.id);
                  setMoreMetrics(false);
                }}
              >
                <span>{m.label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ),
          )}
        </div>
      </Dialog>
    </div>
  );
}
