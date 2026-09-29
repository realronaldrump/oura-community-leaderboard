# A calmer Oura app

Implemented September 10, 2026. The product now has four primary destinations: Today, Friends, Trends, and Records. Settings, account management, and exports live in the profile menu. Existing one-week challenges remain under Friends.

## What changed

Today puts a notable observation ahead of the three Oura scores, with at most two supporting highlights. A deep-history daily rank takes precedence over an overlapping trend of the same metric: a fifth-best sleep score is not displaced by a generic weekly change. Friends uses readable rows and deliberate head-to-head detail. Trends defaults to the selected person and a 30-day window. The same metric screen serves every destination and supports calendar ranges, source measurements, sleep rhythm, and opt-in paired relationships.

The standalone What-if, Snapshot, Patterns, Streaks, Milestones, and analytics hub were removed, along with duplicate score/metric modals, the large history table, and their unused dependencies. Records replaces the badge catalog with explainable events. Legacy URLs redirect to their corresponding destinations. The visual system uses ivory, cream, lavender, sage, and apricot clay surfaces, a compact header, recessed selected controls, and four bottom tabs. Charts retain data-aware scales and touch/keyboard inspection.

## Metric and recognition contract

`domain/metrics.ts` owns 83 curated measurements (79 recordable), units, source fields, interpretation, valid aggregations, and canonical observation extraction. The registry covers the three scores and their contributors, main sleep and naps, stage shares, timing, activity, HR/HRV, breathing, oxygen, temperature, stress, restoration, resilience contributors, cardiovascular age, VO2 max, workouts, and guided sessions. Missing or unavailable values are not invented. Raw contextual collections remain available through details and lossless exports.

Records follow the records-2 rules (September 29, 2026), which replaced the original 8,680-rule engine after it produced near-duplicate rolling windows ("#1 Aug 29–Sep 27, #2 Aug 31–Sep 29") and contributor-level results few people could act on. `domain/recordSpecs.ts` limits records to measures people track: sleep, readiness and activity scores, time asleep, deep and REM sleep, HRV, resting heart rate, steps, active calories, workouts and activity-goal streaks. Every other measurement remains available in Trends and metric detail.

Records compare only calendar periods people recognize: a day, a Monday–Sunday week (at least 6 recorded days), or a calendar month (at least 80% of its days). Steps and calories use the daily average for weeks and months; workouts use totals. Values are ranked at the precision they are displayed, so identical-looking results always tie. Each result is compared once against the whole history available through that day and becomes at most one record: a personal best (or a tie with at most one earlier result), a top-3 result with enough history, a best in at least 3 months, or, for every record metric, a strict low in at least 4 months (6 for months). Lows require a scored night or a worn day, so a missing ring is never "fewest steps". Streaks use fixed, stated thresholds (for example, a sleep score of 85+ or 10,000+ steps) and are recognized only when they become the longest or reach a milestone, never every day they continue.

Each record carries the result it beat, the last time it was this good or this low, and your usual (the median of the previous 90 days, 12 weeks, or 6 months). `domain/recordCopy.ts` turns those into plain language: "Best weekly sleep score ever · Averaged 86.4 · previous best 84.1 (week of Mar 3, 2025)", "Highest HRV in 7 months · 68 ms · usually 52 ms". "Ever" requires complete scanned coverage and at least a year of history; otherwise the wording says "since you started" or names the month the history begins.

Today features at most three records, one per metric and two per category, ranked personal best, longest streak, top 3, milestone, best in a while, then lows. At most one low is featured, never ahead of a positive record, and only when it is the lowest in at least 6 months (a year for months). Featured history is kept for seven days so the same record is not repeated, except that a still-counting activity record is featured again once the day completes. The Records tab adds "Your bests": the top five days, weeks, months and streaks for each metric, with the current week, month and streak compared against them.

## Server publication and recovery

Record detail now loads a read-only, paged ranking context from the published metric projections. Its nearby view shows the leading results and the entries around the selected result; all remaining ranks can be browsed 20 at a time. Rows include values, dates or complete period ranges, ties, and a link to that date's metric detail. Days, calendar weeks and months, streaks, shared recognitions and matched friend gaps reuse the evaluator's period construction and historical cutoff. The endpoint checks rank, count, value, exclusions and publication revision before returning evidence; it never substitutes a contradictory ranking or reads raw sample streams for the sheet.

A rules change rebuilds the archive under a new generation. Older published records stay readable until then, but the app hides records-1 rolling-window, variation and non-record-metric events. A worker bundle never rebuilds over a summary published by newer rules. Days without records are not indexed, so paging back always finds records.

The server builds compact monthly metric projections from durable daily/raw source documents. Summary documents reference immutable month versions. Record day manifests, pages, and a searchable archive index are also immutable; only the final summary pointer is published transactionally. An unpublished or failed generation cannot overwrite a valid archive. Exclusions, source changes, peer inputs, clock context, and lease ownership are checked before publication.

`insightJobs` holds durable pending months, leases, errors, and resumable progress. Dirty months are recorded atomically with successful source metadata. Incompatible drafts are discarded; a newer request can reuse only completed months outside its explicit dirty set. Corrections and deletions prune affected published dates before replay, including days whose last observation disappeared. Historical replay is bounded and resumes through `archiveBefore`.

Successful scanned ranges are tracked separately for each Oura collection, including empty intervals. Reconciliation chooses uncovered historical gaps rather than inferring completeness from the oldest measurement. Optional endpoint failures retain diagnostics and do not certify coverage. Old webhook corrections resolve their object IDs, repair moved-day copies, and invalidate old/new months. Server sync derives and monotonically persists local-clock evidence from Oura sessions/workouts/sleep-time data.

Today reads the compact saved dashboard and one insights summary. It never reads all history or high-volume samples. Trends reads immutable monthly metric documents. Raw day detail, competitions, and export hydrate only when requested. Profile exclusions immediately suppress an incompatible summary.

The protected `/api/cron/insights` endpoint drains bounded work, and runs daily at 13:45 UTC. Successful Oura syncs also request and attempt bounded records work. Both cron endpoints require the existing `CRON_SECRET`. No new platform or client Oura polling was introduced. Shared metric reads retain the existing access model; credentials and jobs remain server-owned.

## Verification

- Type checking, lint, unit/integration tests, and production build pass.
- Tests cover personal bests, top-3 and best-in-a-while wording, strict lows and their gates, ties, missingness, calendar completeness, fixed-threshold streaks and milestones, featured caps, source coverage gaps, immutable publication, incompatible drafts, deletion, lease loss, failed writes/retry, and source-sync coordination.
- A synthetic 10-year benchmark across all record metrics evaluates well under a second per date after the first.
- Synthetic browser QA at 375, 390, and 430 px covers all four destinations and metric detail, with no page overflow or desktop tables.
- The dashboard chunk decreased from approximately 139 kB to 46 kB uncompressed. Obsolete analytical/chart bundles and screenshot-export dependency are removed.

Live Firestore returned HTTP 429 / resource-exhausted during verification; an authenticated Admin SDK repair independently confirmed gRPC code 8 (quota exceeded). Live source backfill and record evidence therefore require a successful post-quota run; synthetic verification is not production data proof. The app now backs off quota retries and explains the service limit while preserving saved profiles. Preview and production deployment evidence is recorded separately when obtained.
