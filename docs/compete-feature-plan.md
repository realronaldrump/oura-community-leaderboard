# Compete Feature Plan

## Goal

Add a `Compete` experience that supports:

- solo goals for one person
- invite-only competitions with 2+ friends
- competitions scheduled to start the next calendar day
- single-metric and multi-metric formats
- invite links that can also onboard a new leaderboard member

The current app already has:

- shared profile membership via Firestore `profiles`
- invite links and a join landing flow
- multi-profile comparisons in the dashboard
- per-profile Oura sync with React Query caches

The missing pieces are a real competition model, invitation state, and a scoring engine.

## Recommended Product Shape

Create one unified concept called `competition` with:

- `mode: 'solo' | 'friends'`
- `format: 'goal' | 'race' | 'combo'`

This replaces the current profile-local `challenges` concept for anything user-facing. The old `challenges` array is fine to leave in place temporarily, but new work should target `competitions`.

### Formats

1. `goal`

- Best for solo goals and accountability groups
- Users pick one or more targets
- Each day earns completion points when targets are met
- Everyone can succeed

Examples:

- 10,000 steps for 7 days
- Sleep score >= 85 and readiness >= 80 for 5 days
- In bed before 10:30 PM plus 7.5h sleep for 14 days

2. `race`

- Best for direct competition between friends
- Rank participants by one aggregated metric over the competition window

Examples:

- most total steps over 7 days
- best average readiness over 5 days
- most total sleep over 14 days

3. `combo`

- Best for "any combination of things"
- Multiple metrics contribute weighted points toward a daily composite score
- Total score is the sum of daily composite points across the competition

Examples:

- 40% steps, 30% sleep score, 30% readiness score
- 50% sleep duration, 25% activity score, 25% HRV

## Scoring Model

Use a target-based weighted model for `combo` and `goal` so mixed units stay understandable.

### Rule shape

Each competition has `rules[]`:

- `metricId`
- `operator`: `gte | lte | between`
- `target`
- `secondaryTarget?`
- `weight`
- `aggregation`: `daily | total | average`
- `capAtTarget: boolean`

### Recommended scoring behavior

For bounded scores like sleep/readiness/activity:

- contribution = `min(value / target, 1) * weight`

For "lower is better" metrics like resting heart rate or bedtime:

- invert with a dedicated evaluator

For pure `goal` competitions:

- daily completion = all required rules met
- progress = completed days / total days

For `combo` competitions:

- daily score = sum of rule contributions
- leaderboard score = sum of daily scores

For `race` competitions:

- one or more metrics ranked by configured aggregation
- if more than one metric is chosen, use weights and the same capped target normalization

This keeps the math predictable and avoids opaque percentile or z-score systems in v1.

## Metric Catalog

Start with metrics already available in the app and easy to explain:

- `steps`
- `active_calories`
- `sleep_score`
- `readiness_score`
- `activity_score`
- `total_sleep_duration`
- `bedtime_start`
- `average_hrv`
- `lowest_heart_rate`
- `stress_high_minutes`
- `recovery_high_minutes`
- `spo2_average`
- `resilience_level`

Ship v1 with curated templates built from those metrics:

- Step Sprint
- Recovery Reset
- Sleep Week
- Balanced Week
- Early Bedtime Club
- HRV Build

## Data Model

Do not store competitions inside `UserProfile`. Multiplayer state belongs in its own collection.

### Firestore collections

`competitions/{competitionId}`

```ts
type Competition = {
  id: string;
  title: string;
  description?: string;
  mode: 'solo' | 'friends';
  format: 'goal' | 'race' | 'combo';
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
  startDate: string; // local ISO date, default tomorrow
  endDate: string;
  timeZone: string;
  rules: CompetitionRule[];
  participants: CompetitionParticipant[];
  inviteTokenIds?: string[];
  templateId?: string | null;
};

type CompetitionRule = {
  id: string;
  metricId: string;
  label: string;
  operator: 'gte' | 'lte' | 'between';
  target: number;
  secondaryTarget?: number | null;
  weight: number;
  aggregation: 'daily' | 'total' | 'average';
  capAtTarget: boolean;
};

type CompetitionParticipant = {
  profileId: string;
  displayName: string;
  status: 'invited' | 'accepted' | 'declined' | 'removed';
  invitedAt?: string;
  respondedAt?: string;
  joinedAt?: string;
};
```

`competitionInvites/{inviteId}`

```ts
type CompetitionInvite = {
  id: string;
  competitionId: string;
  token: string;
  createdByProfileId: string;
  createdAt: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  acceptedProfileIds: string[];
  status: 'active' | 'revoked' | 'expired';
};
```

### Important recommendation

Do not persist per-day leaderboard results in v1.

Compute results client-side from:

- competition rules
- accepted participants
- existing `dailyStats` React Query caches

Persist snapshots later only if you need:

- historical sharing cards
- notifications
- server-authoritative rankings

## Invite Flow

Reuse the current invite-link pattern, but make it competition-aware.

### Link shape

- generic leaderboard join: `/join`
- competition invite: `/join?competitionInvite=<token>`

### Behavior

1. Recipient opens the invite link.
2. If they are not connected, show the existing join landing plus competition preview.
3. After OAuth completes and profile is created, resolve the token.
4. Add the profile to the competition as `accepted`.
5. If the person is already on the board, let them accept immediately.

This keeps onboarding and competition invitations in one path instead of creating a second invite system.

## Scheduling

Default every newly created competition to start the next calendar day in the creator's timezone.

### Recommended dates

- default `startDate = tomorrow`
- default durations: 3, 5, 7, 14, 30 days

### Why tomorrow is correct

- Oura daily data is often incomplete during the current day
- the app already handles incomplete latest-day coverage
- users understand "starts tomorrow" better than "starts after tonight's sync"

### Scoring freshness rule

Treat the current Oura day as provisional.

For active competitions:

- show today as `in progress`
- rank by last finalized day
- recalculate when the next sync lands

## UI Structure

Add `Compete` as a new dashboard tab instead of a separate top-level route first.

### Compete view sections

1. Hero / actions

- `Create Solo Goal`
- `Challenge Friends`
- template picker

2. Pending invites

- cards for invites you received
- accept / decline actions

3. Starting tomorrow

- competitions in `scheduled` status
- countdown and participant list

4. Active competitions

- progress bar
- leaderboard
- daily rule breakdown

5. History

- completed solo goals
- completed friend competitions

### Builder UX

Use a modal or slide-over with:

- mode selection: solo or friends
- format selection: goal, race, combo
- template shortcuts
- rule rows with metric + target + weight
- duration picker
- participant picker
- invite actions

For multi-metric setups, keep the builder constrained:

- default weights evenly
- auto-normalize weights to 100
- show a plain-language summary as the user edits

Example:

`Starts tomorrow for 7 days. Highest total combo wins: 40% steps toward 10,000, 30% sleep score toward 85, 30% readiness toward 80.`

## Recommended File Structure

Add a new vertical instead of scattering logic inside `Dashboard.tsx`.

- `types/competitionTypes.ts`
- `constants/competitionMetrics.ts`
- `services/competitionService.ts`
- `services/competitionEngine.ts`
- `hooks/useCompetitions.ts`
- `components/compete/CompeteView.tsx`
- `components/compete/CompetitionCard.tsx`
- `components/compete/CompetitionBuilder.tsx`
- `components/compete/CompetitionLeaderboard.tsx`
- `components/compete/CompetitionInviteBanner.tsx`

`Dashboard.tsx` should only:

- add the `compete` tab
- render `CompeteView`
- pass profiles and cached stats down

## Implementation Order

### Phase 1: foundation

- add competition types
- add Firestore collection helpers
- add metric catalog
- add competition engine for rule evaluation and ranking

### Phase 2: read-only UI

- add `Compete` tab
- show empty state
- list scheduled and active competitions from Firestore
- render derived standings from existing daily stats

### Phase 3: create flow

- build solo/friends competition builder
- create competitions with `startDate = tomorrow`
- create shareable competition invite links

### Phase 4: join flow

- extend `/join` landing to preview and accept `competitionInvite`
- auto-accept after OAuth profile creation

### Phase 5: polish

- templates
- per-day breakdown
- completion badges
- shareable winner cards

## Edge Cases

- invited friend has not joined the leaderboard yet
- participant joins after the competition was created but before start
- participant joins after start
- current day not fully synced yet
- some profiles are missing optional Oura scopes for a selected metric
- ties in race/combo formats
- creator removes a participant
- invite link is reused after reaching max uses

For v1:

- only allow metrics that every accepted participant can actually provide
- lock rules once the competition starts
- if someone joins after start, mark them ineligible until the next competition

## Strong Recommendation

The best v1 is:

- `Compete` as a new dashboard tab
- a unified `competition` model
- tomorrow-start scheduling by default
- shared invite links using `/join?competitionInvite=...`
- client-derived scoring from existing daily stats
- three formats only: `goal`, `race`, `combo`

That gives you enough flexibility for solo goals, friend competitions, and custom metric combinations without building a full backend scoring system on day one.
