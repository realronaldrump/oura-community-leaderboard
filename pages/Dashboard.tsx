import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Heart,
  Moon,
  Plus,
  Settings,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useProfileStatsHydration } from "../hooks/useProfileStatsHydration";
import { useInsights } from "../hooks/useInsights";
import { goBack, navigate, useAppRoute } from "../hooks/useAppRoute";
import { BrandMark, Button, Dialog, Skeleton } from "../components/ui";
import {
  CATEGORIES,
  METRICS,
  METRIC_BY_ID,
  exclusionKey,
  formatMetricValue,
  normalizeMetricDays,
  localDay,
  shiftDay,
  validDay,
  type MetricCategory,
} from "../domain/metrics";
import { splitFeatured, type HighlightEvent } from "../domain/records";
import type { DailyStats, UserProfile } from "../types";
import { getProfileDisplayName } from "../utils/profileName";
import { filterDailyStatsForProfile } from "../utils/dataExclusions";
import { getStoredDailyStats } from "../services/firestoreStatsService";
import { readLaunchDashboardStats } from "../services/launchCache";
import { mergeDailyStats } from "../utils/mergeDailyStats";
import { readDayDetail, readInsightSummary } from "../services/insightsService";
import { getCompetitionInviteToken } from "../utils/inviteLink";
import HighlightCard from "../components/explorer/HighlightCard";
import DayCalendar from "../components/DayCalendar";
import { DayDataControl } from "../components/DataExclusionEditor";
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
const SettingsPage = lazy(() => import("./Settings"));
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
const SCORES = [
  { id: "sleep_score", label: "Sleep", icon: Moon },
  { id: "readiness_score", label: "Readiness", icon: Heart },
  { id: "activity_score", label: "Activity", icon: Flame },
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
const dayHeading = (day: string, today: string) =>
  day === today
    ? "Today"
    : day === shiftDay(today, -1)
      ? "Yesterday"
      : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        });
const syncedLabel = (iso: string, today: string) => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Syncs automatically with Oura";
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toLocaleDateString("en-CA") === today;
  return `Synced ${sameDay ? "at" : `${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })},`} ${time}`;
};
const initial = (profile: UserProfile) => (profile.firstName || getProfileDisplayName(profile) || "?").charAt(0).toUpperCase();
function ScoreRing({ value, text }: { value: number | null | undefined; text: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const fraction = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  return (
    <span className="score-ring">
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <circle className="score-ring__track" cx="38" cy="38" r={radius} />
        {fraction > 0 && (
          <circle
            className="score-ring__value"
            cx="38"
            cy="38"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        )}
      </svg>
      <strong>{text}</strong>
    </span>
  );
}
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
  // Keep the chosen day stable when its data is ignored, and reject future URLs.
  const latest = useMemo(() => normalizeMetricDays(raw || EMPTY).filter(o => o.day <= today).at(-1)?.day, [raw, today]);
  const day = validDay(requestedDay) && requestedDay <= today ? requestedDay : latest || today;
  const insights = useInsights(activeProfile, profiles, route.pathname === "/" ? day : undefined);
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
  const { hero, supporting } = splitFeatured(insights.highlights);
  const openMetric = (id: string) => {
    setCategory(null);
    navigate(`/metrics/${id}?day=${day}`);
  };
  const openRecord = (record: HighlightEvent) =>
    navigate(`/records/${encodeURIComponent(record.id)}`);
  const goToDay = (next: string) =>
    navigate(next >= today ? "/" : `/?day=${next}`, true);
  const sleepOn = (f: (typeof friendData)[number]) =>
    f.observations.find((o) => o.day === day)?.values.sleep_score;
  const friendScores = friendData
    .filter((f) => sleepOn(f) != null)
    .sort((a, b) => sleepOn(b)! - sleepOn(a)!);
  const rank =
    values.sleep_score == null
      ? null
      : friendScores.filter((f) => sleepOn(f)! > values.sleep_score).length + 1;
  const quiet = insights.highlightsError
    ? { title: "Records didn’t load", text: "Check your connection and try again." }
    : insights.rebuilding
      ? { title: "Updating records", text: "Applying your excluded days." }
      : insights.highlightsPending || (raw && !summary)
        ? { title: "Checking for records", text: "Looking through your history." }
        : summary
          ? { title: day === today ? "No records today" : "No records this day", text: "Tap a score for the details." }
          : { title: "Loading", text: "Getting your saved Oura data." };
  const essentials: Array<[string, string]> = [
    ["sleep_duration", day === today ? "Last night" : "That night"],
    ["hrv", "Overnight average"],
    ["lowest_hr", "Overnight low"],
    ["steps", day === today ? "So far today" : "That day"],
  ];
  return (
    <div className="calm-app">
      <header className="calm-header">
        <button
          type="button"
          className="calm-brand"
          onClick={() => navigate("/")}
          aria-label="Davis Watches You Sleep, go to Today"
        >
          <BrandMark size={36} />
          <strong>Davis Watches You Sleep</strong>
        </button>
        <button
          type="button"
          className="profile-button"
          aria-label="Account and settings"
          onClick={() => setMenu(true)}
        >
          {initial(activeProfile)}
        </button>
      </header>
      <main className="calm-main">
        <Suspense fallback={<Loading />}>
          {route.pathname === "/" && !challenge && (
            <>
              <div className="today-heading">
                <div>
                  {activeProfile.firstName && (
                    <p className="eyebrow">{activeProfile.firstName}</p>
                  )}
                  <h1>{dayHeading(day, today)}</h1>
                </div>
                <div className="date-stepper">
                  <button
                    type="button"
                    aria-label="Previous day"
                    onClick={() => goToDay(shiftDay(day, -1))}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="date-pill"
                    type="button"
                    aria-label={`Choose a date, ${dateLabel(day, true)} selected`}
                    onClick={() => setCalendar(true)}
                  >
                    {dateLabel(day)}
                  </button>
                  <button
                    type="button"
                    aria-label="Next day"
                    disabled={day >= today}
                    onClick={() => goToDay(shiftDay(day, 1))}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <DayDataControl key={`${activeProfile.id}:${day}`} profile={activeProfile} day={day} />
              {hero ? (
                <HighlightCard
                  event={hero}
                  hero
                  relativeTo={day}
                  onClick={() => openRecord(hero)}
                />
              ) : (
                <section className="quiet-hero" aria-live="polite">
                  <span className="quiet-hero__mark" aria-hidden="true">
                    <Moon size={22} />
                  </span>
                  <div>
                    <h2>{quiet.title}</h2>
                    <p>{quiet.text}</p>
                    {insights.highlightsError && (
                      <Button variant="quiet" size="sm" onClick={() => void insights.refetchHighlights()}>
                        Try again
                      </Button>
                    )}
                  </div>
                </section>
              )}
              <div className="daily-scores">
                {SCORES.map(({ id, label, icon: Icon }) => {
                  const m = METRIC_BY_ID[id];
                  const text = formatMetricValue(m, values[id]);
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`daily-score tone-${m.category}`}
                      onClick={() => openMetric(id)}
                      aria-label={`${m.label}: ${text}. View details`}
                    >
                      <ScoreRing value={values[id]} text={text} />
                      <span className="daily-score__label">
                        <Icon size={14} aria-hidden="true" />
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {supporting.length > 0 && (
                <section className="supporting-highlights" aria-label="More records">
                  {supporting.map((e) => (
                    <HighlightCard
                      key={e.id}
                      event={e}
                      relativeTo={day}
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
                  <span className="circle-avatars" aria-hidden="true">
                    {friendScores.slice(0, 3).map((f) => (
                      <span key={f.profile.id}>{initial(f.profile)}</span>
                    ))}
                  </span>
                  <span>
                    <strong>
                      #{rank} in sleep {day === today ? "today" : `on ${dateLabel(day)}`}
                    </strong>
                    <small>{friendScores.length} people · Leaderboard</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : null}
              <section className="detail-section">
                <div className="section-title">
                  <h2>Details</h2>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setDayDetail(true)}
                  >
                    Timeline <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="daily-essentials">
                  {essentials.map(([id, hint]) => (
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
                <nav className="category-links" aria-label="Measurements by category">
                  {Object.entries(CATEGORIES).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setCategory(id as MetricCategory)}
                    >
                      <span className={`category-dot tone-${id}`} aria-hidden="true" />
                      {label}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </nav>
              </section>
              <p className="page-footnote">
                {activeProfile.lastSuccessfulSyncAt
                  ? syncedLabel(activeProfile.lastSuccessfulSyncAt, today)
                  : "Syncs automatically with Oura"}
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
                <ArrowLeft size={18} aria-hidden="true" /> Friends
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
          {route.pathname === "/settings" && (
            <>
              <button className="back-link" type="button" onClick={() => goBack("/")}>
                <ArrowLeft size={18} aria-hidden="true" /> Back
              </button>
              <SettingsPage />
            </>
          )}
          {route.pathname === "/settings/export" && (
            <>
              <button className="back-link" type="button" onClick={() => goBack("/settings")}>
                <ArrowLeft size={18} aria-hidden="true" /> Back
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
            <tab.icon size={21} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <Dialog isOpen={menu} title="Account" onClose={() => setMenu(false)}>
        <div className="profile-menu">
          <div>
            <p className="eyebrow">Viewing</p>
            <div className="profile-menu__group">
              {profiles.map((profile) => (
                <button
                  type="button"
                  key={profile.id}
                  aria-current={profile.id === activeProfile.id ? "true" : undefined}
                  onClick={() => {
                    setActiveProfileId(profile.id);
                    setMenu(false);
                    navigate("/");
                  }}
                >
                  <span className="friend-avatar" aria-hidden="true">
                    {initial(profile)}
                  </span>
                  {getProfileDisplayName(profile)}
                  {profile.id === activeProfile.id && (
                    <span className="selected-label ui-badge ui-badge--accent">Current</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="profile-menu__group">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                navigate("/settings");
              }}
            >
              <Settings size={19} aria-hidden="true" /> Settings
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                navigate("/settings/export");
              }}
            >
              <Download size={19} aria-hidden="true" /> Export data
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setInvite(true);
              }}
            >
              <UserPlus size={19} aria-hidden="true" /> Invite a friend
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={login}>
              <Plus size={19} aria-hidden="true" /> Connect another Oura account
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog
        isOpen={calendar}
        title="Choose a day"
        onClose={() => setCalendar(false)}
      >
        <DayCalendar key={`${activeProfile.id}:${day}`} selectedDay={day} today={today} ranges={activeProfile.dataExclusionRanges} onSelect={selected => {
          goToDay(selected);
          setCalendar(false);
        }} />
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
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          {dailyDetail.isFetching && !METRICS.some((m) => m.category === category && values[m.id] != null) && (
            <p className="empty-note" role="status">Loading…</p>
          )}
          {!dailyDetail.isFetching && !METRICS.some((m) => m.category === category && values[m.id] != null) && (
            <p className="empty-note">Nothing recorded for {dateLabel(day)}.</p>
          )}
        </div>
      </Dialog>
      <Dialog
        isOpen={dayDetail}
        title={`Timeline · ${dateLabel(day)}`}
        onClose={() => setDayDetail(false)}
      >
        <Suspense fallback={<Loading />}>
          {dayStats ? (
            <DayContext stats={dayStats} day={day} />
          ) : (
            <p className="empty-note" role="status">Loading…</p>
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
