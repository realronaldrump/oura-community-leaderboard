# A calmer Oura app

Implemented September 10, 2026. The product now has four primary destinations: Today, Friends, Trends, and Records. Settings, account management, and exports live in the profile menu. Existing one-week challenges remain under Friends.

## What changed

Today puts a notable observation ahead of the three Oura scores, with at most two supporting highlights. A deep-history daily rank takes precedence over an overlapping trend of the same metric: a fifth-best sleep score is not displaced by a generic weekly change. Friends uses readable rows and deliberate head-to-head detail. Trends defaults to the selected person and a 30-day window. The same metric screen serves every destination and supports calendar ranges, source measurements, sleep rhythm, and opt-in paired relationships.

The standalone What-if, Snapshot, Patterns, Streaks, Milestones, and analytics hub were removed, along with duplicate score/metric modals, the large history table, and their unused dependencies. Records replaces the badge catalog with explainable events. Legacy URLs redirect to their corresponding destinations. The visual system uses ivory, cream, lavender, sage, and apricot clay surfaces, a compact header, recessed selected controls, and four bottom tabs. Charts retain data-aware scales and touch/keyboard inspection.

## Metric and recognition contract

`domain/metrics.ts` owns 83 curated measurements (79 recordable), units, source fields, interpretation, valid aggregations, and canonical observation extraction. The registry covers the three scores and their contributors, main sleep and naps, stage shares, timing, activity, HR/HRV, breathing, oxygen, temperature, stress, restoration, resilience contributors, cardiovascular age, VO2 max, workouts, and guided sessions. Missing or unavailable values are not invented. Raw contextual collections remain available through details and lossless exports.

`domain/records.ts` generates 8,680 eligible metric/family/period/direction/window rules. Highs and lows, daily top-ten placements, complete rolling/calendar periods, variation, changes, frozen-baseline streaks, and relevant friend events use shared evaluators. All-time wording requires complete scanned source coverage; otherwise the event says when its compared observations begin. Historical ranks use only observations available through the highlighted date. Today also considers the accumulating day that just finished, explicitly labeled Yesterday. Calendar gaps break periods/streaks, legitimate zeros survive, and current accumulating lows are suppressed.

Notability is an editorial 0–100 ranking, not medical confidence: rarity 40%, history depth 20%, magnitude 15%, persistence 10%, novelty 10%, recency 5%. Archive qualification starts at 40 and featured selection at 65. Overlapping comparison windows merge into one event. Featured results are capped at three, one per metric and two per category, with seven-day repeat suppression. Neutral physiology is described as high/low/early/late rather than universally good/bad. Relationships are opt-in, require 30 matched varying observations, and do not make causal claims.

## Server publication and recovery

Record detail now loads a read-only, paged ranking context from the published metric projections. Its nearby view shows the leading results and the entries around the selected result; all remaining ranks can be browsed 20 at a time. Rows include values, dates or complete period ranges, ties, and a link to that date's metric detail. Daily results, rolling averages/totals, calendar weeks/months, spread, changes, frozen-baseline streaks, shared recognitions and matched friend gaps reuse the evaluator's period construction and historical cutoff. The endpoint checks rank, count, value, exclusions and publication revision before returning evidence; it never substitutes a contradictory ranking or reads raw sample streams for the sheet.

The archive places non-clock variation below clearer records, and those statistical records do not occupy featured slots. Bedtime and wake-time spread remains eligible, worded as consistency or changeability. Ranking calculations and the 0–100 notability factors remain unchanged. Historical record documents are retained; the new presentation applies to existing records as well as newly generated ones.

The server builds compact monthly metric projections from durable daily/raw source documents. Summary documents reference immutable month versions. Record day manifests, pages, and a searchable archive index are also immutable; only the final summary pointer is published transactionally. An unpublished or failed generation cannot overwrite a valid archive. Exclusions, source changes, peer inputs, clock context, and lease ownership are checked before publication.

`insightJobs` holds durable pending months, leases, errors, and resumable progress. Dirty months are recorded atomically with successful source metadata. Incompatible drafts are discarded; a newer request can reuse only completed months outside its explicit dirty set. Corrections and deletions prune affected published dates before replay, including days whose last observation disappeared. Historical replay is bounded and resumes through `archiveBefore`.

Successful scanned ranges are tracked separately for each Oura collection, including empty intervals. Reconciliation chooses uncovered historical gaps rather than inferring completeness from the oldest measurement. Optional endpoint failures retain diagnostics and do not certify coverage. Old webhook corrections resolve their object IDs, repair moved-day copies, and invalidate old/new months. Server sync derives and monotonically persists local-clock evidence from Oura sessions/workouts/sleep-time data.

Today reads the compact saved dashboard and one insights summary. It never reads all history or high-volume samples. Trends reads immutable monthly metric documents. Raw day detail, competitions, and export hydrate only when requested. Profile exclusions immediately suppress an incompatible summary.

The protected `/api/cron/insights` endpoint drains bounded work, and runs daily at 13:45 UTC. Successful Oura syncs also request and attempt bounded records work. Both cron endpoints require the existing `CRON_SECRET`. No new platform or client Oura polling was introduced. Shared metric reads retain the existing access model; credentials and jobs remain server-owned.

## Verification

- Type checking, lint, unit/integration tests, and production build pass.
- Tests cover fifth-best prominence, ties, missingness, complete periods, streak gaps, shared lows, source coverage gaps, immutable publication, incompatible drafts, deletion, lease loss, failed writes/retry, and source-sync coordination.
- A synthetic 10-year, 79-metric benchmark measured about 7 seconds cold and 0.4–0.6 seconds for subsequent dates after cached transformation.
- Synthetic browser QA at 375, 390, and 430 px covers all four destinations and metric detail, with no page overflow or desktop tables.
- The dashboard chunk decreased from approximately 139 kB to 46 kB uncompressed. Obsolete analytical/chart bundles and screenshot-export dependency are removed.

Live Firestore returned HTTP 429 / resource-exhausted during verification; an authenticated Admin SDK repair independently confirmed gRPC code 8 (quota exceeded). Live source backfill and record evidence therefore require a successful post-quota run; synthetic verification is not production data proof. The app now backs off quota retries and explains the service limit while preserving saved profiles. Preview and production deployment evidence is recorded separately when obtained.
