# Competitions

The competition experience is deliberately small: choose a challenge, choose friends or solo, and create. There is one entry point and no advanced setup screen.

## New challenges

All new competitions start tomorrow in the creator's browser timezone and last seven calendar days. The stored timezone also determines when the competition starts and ends. Names and descriptions are automatic.

| Challenge | With friends | Just me |
| --- | --- | --- |
| Steps | Most total steps wins | Reach 10,000 steps each day |
| Sleep | Highest average Oura sleep score wins | Reach 85 each day |
| Readiness | Highest average Oura readiness score wins | Reach 80 each day |

These solo targets are game defaults, not medical recommendations. There are no editable titles, descriptions, dates, durations, targets, weights, operators, formats, or custom metric combinations in setup. Optional friend selections and a share link cover invitations.

## Scoring and compatibility

- New friend competitions store `scoring: 'total' | 'average'` and one metric rule. Results use actual steps or average Oura scores, without target normalization or caps.
- Averages use only available Oura days. Cards show the number of synced days. Missing data displays as waiting, not a zero result. Today's results can change as Oura syncs.
- Solo goals count successful days against the entire seven-day window.
- Equal scores share a rank.
- Existing competitions retain their stored formats, metrics, weights, dates, and scoring. Absence of `scoring` selects the original weighted evaluator. No migration rewrites saved competitions.
- The competition route loads saved full history on demand and merges current dashboard data. Startup continues to use the compact snapshot. Loading and failed history reads do not appear as completed standings.

## Creation, invites, and history

- Creation saves the competition and optional invitation atomically. While saving, setup choices, repeat submission, and dismissal are blocked. A failure preserves the choices for retry.
- The new competition appears first with its invitation action. Sharing uses the system share sheet where available and otherwise copies the link, with visible success or failure feedback.
- Invite links use `/join?competitionInvite=<token>`. The landing page shows the challenge before profile selection. Existing profiles can join; new profiles continue through Oura connection.
- Loading, unavailable, full, closed, and already-joined invitations are distinct states. Completed and cancelled competitions cannot be joined or shared through the competition service.
- Pending invitations appear once. Declined and removed participants do not see the competition among their own active entries.
- Current competitions are shown first. All past competitions remain available in collapsed history.

## Code and verification

- `components/compete/CompetitionBuilder.tsx`: short accessible form.
- `components/compete/CompeteView.tsx`: invitations, creation feedback, current competitions, history.
- `components/compete/CompetitionCard.tsx`: standings or solo progress, with legacy scoring details on demand.
- `constants/competitionMetrics.ts`: curated challenges and legacy metric definitions.
- `services/competitionEngine.ts`: real-unit scoring and legacy compatibility.
- `services/competitionService.ts`: persistence and invitation transactions.

`npm run verify` runs type checking, lint, tests, and a production build. Regression tests cover no-input creation, solo/friend switching, saving and retry behavior, invitations, score math, legacy results, ties, full-week progress, clipboard fallback, and deferred history loading. Browser verification uses both the actual app and an ignored sample-data harness under `artifacts/competitions/`.
