import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Flame,
  Heart,
  Moon,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useProfileStatsHydration } from "../hooks/useProfileStatsHydration";
import { useInsights } from "../hooks/useInsights";
import { goBack, navigate, useAppRoute } from "../hooks/useAppRoute";
import { Button, Dialog, Skeleton } from "../components/ui";
import {
  CATEGORIES,
  METRICS,
  METRIC_BY_ID,
  exclusionKey,
  formatMetricValue,
  normalizeMetricDays,
  localDay,
  validDay,
  type MetricCategory,
} from "../domain/metrics";
import type { HighlightEvent } from "../domain/records";
import type { DailyStats, UserProfile } from "../types";
import { getProfileDisplayName } from "../utils/profileName";
import { filterDailyStatsForProfile } from "../utils/dataExclusions";
import { getStoredDailyStats } from "../services/firestoreStatsService";
import { readLaunchDashboardStats } from "../services/launchCache";
import { mergeDailyStats } from "../utils/mergeDailyStats";
import { readDayDetail, readInsightSummary } from "../services/insightsService";
import { getCompetitionInviteToken } from "../utils/inviteLink";
import HighlightCard from "../components/explorer/HighlightCard";
const TrendsView = lazy(() => import("../components/explorer/TrendsView"));
const RecordsView = lazy(() => import("../components/explorer/RecordsView"));
const FriendsView = lazy(() => import("../components/explorer/FriendsView"));
const MetricDetail = lazy(() => import("../components/explorer/MetricDetail"));
const RecordEvidenceSheet = lazy(() =>
  import("../components/explorer/MetricDetail").then((m) => ({
    default: m.RecordEvidenceSheet,
  })),
);
const DayContext = lazy(() =>
  import("../components/explorer/MetricDetail").then((m) => ({
    default: m.DayContext,
  })),
);
const CompeteView = lazy(() => import("../components/compete/CompeteView"));
const DataExport = lazy(() => import("./DataExport"));
const InviteLinkModal = lazy(() => import("../components/InviteLinkModal"));
const EMPTY: DailyStats = {
  sleep: [],
  readiness: [],
  activity: [],
  session: [],
  spo2: [],
  stress: [],
  resilience: [],
};
const TABS = [
  { path: "/", label: "Today", icon: CalendarDays },
  { path: "/friends", label: "Friends", icon: Users },
  { path: "/trends", label: "Trends", icon: TrendingUp },
  { path: "/records", label: "Records", icon: Sparkles },
];
const Loading = () => (
  <div className="page-loading" role="status" aria-label="Loading view">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-52 w-full rounded-3xl" />
    <Skeleton className="h-20 w-full rounded-3xl" />
  </div>
);
const dateLabel = (day: string, year = false) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
function DashboardContent({
  activeProfile,
  profiles,
}: {
  activeProfile: UserProfile;
  profiles: UserProfile[];
}) {
  const { setActiveProfileId, login } = useUser();
  const route = useAppRoute();
  const [menu, setMenu] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [invite, setInvite] = useState(false);
  const [category, setCategory] = useState<MetricCategory | null>(null);
  const [event, setEvent] = useState<HighlightEvent | null>(null);
  const [dayDetail, setDayDetail] = useState(
    route.searchParams.get("detail") === "day",
  );
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = localDay(activeProfile, clock);
  const { hydratedProfileIds } = useProfileStatsHydration(
    profiles.map((p) => p.id),
    activeProfile.id,
  );
  const dailyQueries = useQueries({
    queries: profiles.map((profile) => ({
      queryKey: ["dailyStats", profile.id],
      queryFn: async () => EMPTY,
      initialData: () => readLaunchDashboardStats(profile.id) || undefined,
      enabled: false,
      staleTime: Infinity,
    })),
  });
  const ownIndex = profiles.findIndex((p) => p.id === activeProfile.id);
  const raw = dailyQueries[ownIndex]?.data;
  const available = useMemo(
    () =>
      normalizeMetricDays(raw || EMPTY, activeProfile, {
        sessionsComplete: false,
      }),
    [raw, activeProfile],
  );
  const requestedDay = route.searchParams.get("day");
  const latest = available.filter((o) => o.day <= today).at(-1)?.day;
  const day = validDay(requestedDay) ? requestedDay : latest || today;
  const insights = useInsights(activeProfile, profiles);
  const summary = insights.data;
  const metricProfile =
    profiles.find((p) => p.id === route.searchParams.get("profile")) ||
    activeProfile;
  const viewedSummary = useQuery({
    queryKey: ["insights", metricProfile.id],
    queryFn: () => readInsightSummary(metricProfile.id),
    enabled:
      metricProfile.id !== activeProfile.id &&
      route.pathname.startsWith("/metrics/"),
    staleTime: 60_000,
  });
  const detailSummary =
    metricProfile.id === activeProfile.id
      ? summary
      : viewedSummary.data?.exclusions === exclusionKey(metricProfile)
        ? viewedSummary.data
        : null;
  const dailyDetail = useQuery({
    queryKey: ["day-detail", activeProfile.id, day, summary?.revision],
    queryFn: () => readDayDetail(activeProfile.id, day),
    enabled:
      dayDetail ||
      Boolean(category) ||
      (Boolean(requestedDay) && !available.some((o) => o.day === day)),
    staleTime: 60_000,
  });
  const dayStats = filterDailyStatsForProfile(
    dailyDetail.data || raw,
    activeProfile,
  );
  const observations = useMemo(
    () =>
      dailyDetail.data
        ? normalizeMetricDays(dailyDetail.data, activeProfile)
        : available,
    [dailyDetail.data, activeProfile, available],
  );
  const values = observations.find((o) => o.day === day)?.values || {};
  const friendData = useMemo(
    () =>
      profiles.map((profile, i) => ({
        profile,
        observations: normalizeMetricDays(
          dailyQueries[i]?.data || EMPTY,
          profile,
        ),
      })),
    [profiles, dailyQueries],
  );
  const challenge =
    route.pathname === "/friends/challenges" ||
    route.pathname === "/leaderboard/compete" ||
    Boolean(getCompetitionInviteToken(route.search));
  const competitionQueries = useQueries({
    queries: profiles.map((profile) => ({
      queryKey: ["allTimeStats", profile.id],
      queryFn: async () => {
        const data = await getStoredDailyStats(profile.id);
        if (!data) throw new Error("Saved history is not ready.");
        return data;
      },
      enabled: challenge && hydratedProfileIds.has(profile.id),
      staleTime: Infinity,
    })),
  });
  const competitionData = profiles.map((profile, i) => ({
    profile,
    data: filterDailyStatsForProfile(
      competitionQueries[i]?.data && dailyQueries[i]?.data
        ? mergeDailyStats(competitionQueries[i].data!, dailyQueries[i].data!)
        : competitionQueries[i]?.data || dailyQueries[i]?.data,
      profile,
    ),
    isLoading:
      !hydratedProfileIds.has(profile.id) ||
      Boolean(competitionQueries[i]?.isFetching),
    isError: Boolean(competitionQueries[i]?.isError),
  }));
  const activeTab = challenge
    ? "/friends"
    : route.pathname.startsWith("/metrics")
      ? "/trends"
      : route.pathname.startsWith("/records")
        ? "/records"
        : route.pathname;
  const featured = summary?.day === day ? summary.featured : [];
  const openMetric = (id: string) => {
    setCategory(null);
    navigate(`/metrics/${id}?day=${day}`);
  };
  const openRecord = (record: HighlightEvent) =>
    navigate(`/records/${encodeURIComponent(record.id)}`);
  const scores = ["sleep_score", "readiness_score", "activity_score"];
  const friendScores = friendData
    .filter(
      (f) =>
        f.observations.find((o) => o.day === day)?.values.sleep_score != null,
    )
    .sort(
      (a, b) =>
        b.observations.find((o) => o.day === day)!.values.sleep_score -
        a.observations.find((o) => o.day === day)!.values.sleep_score,
    );
  const rank =
    values.sleep_score == null
      ? null
      : friendScores.filter(
          (f) =>
            f.observations.find((o) => o.day === day)!.values.sleep_score >
            values.sleep_score,
        ).length + 1;
  return (
    <div className="calm-app">
      <header className="calm-header">
        <button
          className="calm-brand"
          onClick={() => navigate("/")}
          aria-label="Davis Watches You Sleep home"
        >
          <span>D</span>
          <strong>
            Davis Watches
            <br />
            You Sleep
          </strong>
        </button>
        <button
          type="button"
          className="profile-button"
          aria-label="Open profile and settings"
          onClick={() => setMenu(true)}
        >
          {(activeProfile.firstName || "You")[0]}
        </button>
      </header>
      <main className="calm-main">
        <Suspense fallback={<Loading />}>
          {route.pathname === "/" && !challenge && (
            <>
              <div className="today-heading">
                <div>
                  <p className="eyebrow">
                    {activeProfile.firstName || "Your daily perspective"}
                  </p>
                  <h1>{day === today ? "Today" : "A day to revisit"}</h1>
                </div>
                <button
                  className="date-pill"
                  type="button"
                  onClick={() => setCalendar(true)}
                >
                  <CalendarDays size={15} />
                  {dateLabel(day)}
                </button>
              </div>
              {featured[0] ? (
                <HighlightCard
                  event={featured[0]}
                  hero
                  onClick={() => openRecord(featured[0])}
                />
              ) : (
                <section className="quiet-hero">
                  <div className="quiet-hero__mark">
                    <Moon size={26} />
                  </div>
                  <p className="eyebrow">A moment for perspective</p>
                  <h2>
                    {raw
                      ? "Every day tells a story."
                      : "Making room for your day."}
                  </h2>
                  <p>
                    {insights.rebuilding
                      ? "Your highlights are being updated to reflect your excluded days."
                      : summary
                        ? "Nothing unusual to flag. Your measurements are here whenever you want a closer look."
                        : raw
                          ? "Your scores are here. Your history is being checked for the moments that stand out."
                          : "Loading your saved Oura measurements…"}
                  </p>
                </section>
              )}
              <div className="daily-scores">
                {scores.map((id) => {
                  const m = METRIC_BY_ID[id];
                  const Icon =
                    id === "sleep_score"
                      ? Moon
                      : id === "readiness_score"
                        ? Heart
                        : Flame;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`daily-score tone-${m.category}`}
                      onClick={() => openMetric(id)}
                      aria-label={`${m.label}: ${formatMetricValue(m, values[id])}. View details`}
                    >
                      <Icon size={18} />
                      <span>{m.label.replace(" score", "")}</span>
                      <strong>{formatMetricValue(m, values[id])}</strong>
                    </button>
                  );
                })}
              </div>
              {featured.length > 1 && (
                <section className="supporting-highlights">
                  {featured.slice(1).map((e) => (
                    <HighlightCard
                      key={e.id}
                      event={e}
                      onClick={() => openRecord(e)}
                    />
                  ))}
                </section>
              )}
              {rank && friendScores.length > 1 ? (
                <button
                  className="circle-summary"
                  type="button"
                  onClick={() => navigate("/friends")}
                >
                  <div className="circle-avatars">
                    {friendScores.slice(0, 3).map((f) => (
                      <span key={f.profile.id}>
                        {(f.profile.firstName || "?")[0]}
                      </span>
                    ))}
                  </div>
                  <span>
                    <strong>#{rank} in sleep today</strong>
                    <small>
                      {friendScores.length} friends, a little perspective
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ) : null}
              <section className="detail-section">
                <div className="section-title">
                  <h2>A closer look</h2>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setDayDetail(true)}
                  >
                    Your day <ChevronRight size={15} />
                  </button>
                </div>
                <div className="daily-essentials">
                  {[
                    ["sleep_duration", "Bedtime & wake time"],
                    ["hrv", "Your nightly variation"],
                    ["lowest_hr", "During your main sleep"],
                    ["steps", "Movement so far"],
                  ].map(([id, hint]) => (
                    <button
                      type="button"
                      key={id}
                      className="essential"
                      onClick={() => openMetric(id)}
                    >
                      <span>{METRIC_BY_ID[id].label}</span>
                      <strong>{formatMetricValue(id, values[id])}</strong>
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>
                <div className="category-links">
                  {Object.entries(CATEGORIES).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setCategory(id as MetricCategory)}
                    >
                      <span className={`category-dot tone-${id}`} />
                      {label}
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </section>
              <p className="page-footnote">
                {activeProfile.lastSuccessfulSyncAt
                  ? `Saved ${new Date(activeProfile.lastSuccessfulSyncAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · Updates automatically from Oura`
                  : "Updates automatically when Oura syncs"}
              </p>
            </>
          )}
          {route.pathname === "/friends" && (
            <FriendsView
              activeProfile={activeProfile}
              friends={friendData}
              summary={summary}
              day={day}
              onInvite={() => setInvite(true)}
            />
          )}
          {route.pathname === "/trends" && (
            <TrendsView
              key={activeProfile.id}
              profile={activeProfile}
              summary={summary}
              fallback={available}
              day={day}
            />
          )}
          {route.pathname.startsWith("/records") && (
            <RecordsView
              key={activeProfile.id}
              summary={summary}
              profileId={activeProfile.id}
            />
          )}
          {route.pathname.startsWith("/metrics/") && (
            <MetricDetail
              key={`${metricProfile.id}:${route.pathname}`}
              id={decodeURIComponent(route.pathname.slice("/metrics/".length))}
              profile={metricProfile}
              day={day}
              summary={detailSummary || null}
              fallback={
                friendData.find((f) => f.profile.id === metricProfile.id)
                  ?.observations || []
              }
            />
          )}
          {challenge && (
            <>
              <button
                className="back-link"
                type="button"
                onClick={() => navigate("/friends")}
              >
                <ArrowLeft size={18} /> Friends
              </button>
              <CompeteView
                activeProfile={activeProfile}
                profiles={profiles}
                profileData={competitionData}
                competitionInviteToken={getCompetitionInviteToken(route.search)}
                onClearCompetitionInviteToken={() =>
                  navigate("/friends/challenges", true)
                }
              />
            </>
          )}
          {route.pathname === "/settings/export" && (
            <>
              <button className="back-link" onClick={() => goBack("/settings")}>
                <ArrowLeft size={18} /> Back
              </button>
              <DataExport />
            </>
          )}
        </Suspense>
      </main>
      <nav className="calm-nav" aria-label="Primary navigation">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.path}
            aria-current={activeTab === tab.path ? "page" : undefined}
            onClick={() => navigate(tab.path)}
          >
            <tab.icon size={21} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <Dialog
        isOpen={menu}
        title="Your corner of the circle"
        onClose={() => setMenu(false)}
      >
        <div className="profile-menu">
          <p className="eyebrow">Viewing as</p>
          {profiles.map((profile) => (
            <button
              className="profile-menu__person"
              type="button"
              key={profile.id}
              onClick={() => {
                setActiveProfileId(profile.id);
                setMenu(false);
                navigate("/");
              }}
            >
              <span className="friend-avatar">
                {(profile.firstName || "?")[0]}
              </span>
              {getProfileDisplayName(profile)}
              {profile.id === activeProfile.id && (
                <span className="selected-label">Selected</span>
              )}
            </button>
          ))}
          <hr />
          <button
            onClick={() => {
              setMenu(false);
              navigate("/settings");
            }}
          >
            <Settings size={19} /> Settings & connection{" "}
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              setMenu(false);
              navigate("/settings/export");
            }}
          >
            <TrendingUp size={19} /> Export your data <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              setMenu(false);
              setInvite(true);
            }}
          >
            <Users size={19} /> Invite a friend <ChevronRight size={16} />
          </button>
          <button onClick={login}>
            Connect another Oura account <ChevronRight size={16} />
          </button>
        </div>
      </Dialog>
      <Dialog
        isOpen={calendar}
        title="Choose a day"
        onClose={() => setCalendar(false)}
      >
        <label className="field-label">
          Date
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => {
              if (validDay(e.target.value)) {
                navigate(`/?day=${e.target.value}`);
                setCalendar(false);
              }
            }}
          />
        </label>
        <Button
          variant="quiet"
          className="w-full"
          onClick={() => {
            navigate("/");
            setCalendar(false);
          }}
        >
          Back to today
        </Button>
      </Dialog>
      <Dialog
        isOpen={Boolean(category)}
        title={category ? CATEGORIES[category] : ""}
        onClose={() => setCategory(null)}
      >
        <div className="metric-list">
          {METRICS.filter(
            (m) => m.category === category && values[m.id] != null,
          )
            .sort(
              (a, b) =>
                Number(a.field.startsWith("contributors")) -
                Number(b.field.startsWith("contributors")),
            )
            .map((m) => (
              <button
                type="button"
                className="metric-row"
                key={m.id}
                onClick={() => openMetric(m.id)}
              >
                <span>{m.label}</span>
                <strong>{formatMetricValue(m, values[m.id])}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      </Dialog>
      <Dialog
        isOpen={dayDetail}
        title={`Your day · ${dateLabel(day)}`}
        onClose={() => setDayDetail(false)}
      >
        <Suspense fallback={<Loading />}>
          {dayStats ? (
            <DayContext stats={dayStats} day={day} />
          ) : (
            <p role="status">Loading day details…</p>
          )}
        </Suspense>
      </Dialog>
      {event && (
        <Suspense fallback={null}>
          <RecordEvidenceSheet event={event} onClose={() => setEvent(null)} />
        </Suspense>
      )}
      {invite && (
        <Suspense fallback={null}>
          <InviteLinkModal isOpen onClose={() => setInvite(false)} />
        </Suspense>
      )}
    </div>
  );
}
export default function Dashboard() {
  const { activeProfile, profiles } = useUser();
  return activeProfile ? (
    <DashboardContent
      key={activeProfile.id}
      activeProfile={activeProfile}
      profiles={profiles}
    />
  ) : null;
}
