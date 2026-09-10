import React, { useMemo, useState } from "react";
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
  const metric = METRIC_BY_ID[metricId];
  const peer = friends.find((f) => f.profile.id === peerId);
  const own = friends.find((f) => f.profile.id === activeProfile.id);
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
      day,
    ],
    queryFn: async () => {
      const start = shiftDay(day, -29);
      return Promise.all([
        summary
          ? readMetricHistory(activeProfile.id, summary.months, start, day)
          : Promise.resolve(own?.observations || []),
        peerSummary.data
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
        .map((f) => ({
          ...f,
          value: f.observations.find((o) => o.day === day)?.values[metricId],
        }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [friends, metricId, day],
  );
  const pointsA = metricSeries(
    histories.data?.[0] || own?.observations || [],
    metricId,
    shiftDay(day, -29),
    day,
  );
  const pointsB = metricSeries(
    histories.data?.[1] || peer?.observations || [],
    metricId,
    shiftDay(day, -29),
    day,
  );
  const matchedDays = new Set(
    pointsA
      .filter((p) => pointsB.some((q) => q.day === p.day))
      .map((p) => p.day),
  );
  return (
    <div>
      <header className="page-heading">
        <p className="eyebrow">A little friendly rivalry</p>
        <h1>Your circle</h1>
        <p>The scores are only the beginning.</p>
      </header>
      <div className="friends-actions">
        <Button variant="secondary" onClick={onInvite}>
          <UserPlus size={16} /> Invite a friend
        </Button>
        <button
          type="button"
          className="text-action"
          onClick={() => navigate("/friends/challenges")}
        >
          <Swords size={17} /> Challenges <ChevronRight size={16} />
        </button>
      </div>
      <div className="score-selector" role="group" aria-label="Compare scores">
        {["sleep_score", "readiness_score", "activity_score"].map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={metricId === id}
            onClick={() => setMetricId(id)}
          >
            {METRIC_BY_ID[id].label.replace(" score", "")}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={!metricId.endsWith("_score")}
          onClick={() => setMoreMetrics(true)}
        >
          More
        </button>
      </div>
      <section className="friends-board">
        <div className="section-title">
          <h2>{metric.label}</h2>
          <span>
            {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
        {ranked.map((f) => {
          const rank =
            f.value == null
              ? null
              : ranked.filter(
                  (other) => other.value != null && other.value > f.value!,
                ).length + 1;
          const self = f.profile.id === activeProfile.id;
          return (
            <button
              type="button"
              className={`friend-row ${self ? "friend-row--you" : ""}`}
              key={f.profile.id}
              onClick={() =>
                self
                  ? navigate(`/metrics/${metricId}?day=${day}`)
                  : setPeerId(f.profile.id)
              }
            >
              <span className="friend-rank">{rank || "—"}</span>
              <span className="friend-avatar">
                {(f.profile.firstName || "?")[0]}
              </span>
              <span className="friend-name">
                <strong>{getProfileDisplayName(f.profile)}</strong>
                <small>
                  {self
                    ? "You"
                    : f.value == null
                      ? "Waiting for this day"
                      : "See how you compare"}
                </small>
              </span>
              <strong className="friend-value">
                {formatMetricValue(metric, f.value)}
              </strong>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </section>
      {friends.length < 2 && (
        <div className="quiet-state">
          <UserPlus size={30} />
          <h2>Better with a friend</h2>
          <p>Invite someone to compare the detail behind your daily scores.</p>
          <Button onClick={onInvite}>Invite a friend</Button>
        </div>
      )}
      {peer && (
        <section className="detail-section">
          <div className="section-title">
            <h2>You & {peer.profile.firstName || "your friend"}</h2>
            <button
              type="button"
              className="text-action"
              onClick={() => setPeerId(null)}
            >
              Close
            </button>
          </div>
          <p className="fine-print">
            Past 30 days · {matchedDays.size} shared days
          </p>
          <MetricChart
            metric={metric}
            series={[
              {
                label: "You",
                color: metricColor("sleep"),
                points: pointsA.filter((p) => matchedDays.has(p.day)),
              },
              {
                label: peer.profile.firstName || "Friend",
                color: metricColor("recovery"),
                points: pointsB.filter((p) => matchedDays.has(p.day)),
              },
            ]}
          />
          <div className="comparison-details">
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
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/metrics/${id}?profile=${activeProfile.id}&day=${day}`,
                        )
                      }
                    >
                      <small>You</small>
                      <strong>{formatMetricValue(m, yours)}</strong>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/metrics/${id}?profile=${peer.profile.id}&day=${day}`,
                        )
                      }
                    >
                      <small>{peer.profile.firstName}</small>
                      <strong>{formatMetricValue(m, theirs)}</strong>
                    </button>
                  </div>
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
            Explore {peer.profile.firstName}'s history <ArrowRight size={16} />
          </button>
        </section>
      )}
      <Dialog
        isOpen={moreMetrics}
        title="Choose a comparison"
        onClose={() => setMoreMetrics(false)}
      >
        <div className="metric-list">
          {METRICS.filter((m) => m.comparison === "direct" && m.recordable).map(
            (m) => (
              <button
                type="button"
                className="metric-row"
                key={m.id}
                onClick={() => {
                  setMetricId(m.id);
                  setMoreMetrics(false);
                }}
              >
                <span>{m.label}</span>
                <ChevronRight size={16} />
              </button>
            ),
          )}
        </div>
      </Dialog>
    </div>
  );
}
