# Davis Watches You Sleep

Davis Watches You Sleep is a mobile-first Oura leaderboard built first for two people, with room for the circle to grow. It keeps the playful daily rivalry while making shared sleep, readiness, activity, trends, and competitions easier to understand. It uses React 19, TypeScript, Vite, TanStack Query, Firebase/Firestore, Oura OAuth, and Vercel functions.

## Local development

Requirements: Node.js 20+ and an Oura OAuth application.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The development server runs at `http://localhost:3000`. Add that origin to the allowed redirect URIs in the Oura developer console. `OURA_CLIENT_SECRET` is server-only; never expose it through a `VITE_` variable.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

## Product structure

- `/` — Today: selected highlights, core scores, and contextual day detail
- `/friends` — leaderboard and deliberate head-to-head comparison
- `/friends/challenges` — existing one-week challenges and invitations
- `/trends` — personal progress and searchable measurements
- `/records` — searchable record archive and evidence
- `/metrics/:metricId` — shared history and measurement detail
- `/settings` — profile, connection, and exclusions
- `/settings/export` — complete raw data and analysis CSVs

The header avatar opens secondary actions. Old leaderboard, streak, insight-tool, and More URLs redirect to their corresponding destinations. Heavy detail and export views remain lazy. Today loads compact saved snapshots, never full history or raw sample streams.

The metric registry and deterministic records engine cover 83 measurements and 8,680 eligible rules. Server-owned monthly projections and immutable record indexes keep recognition off the phone's launch path. See [the redesign report](docs/redesign-report.md) for semantics, publication, and validation.

## Synchronization invariants

- Authorization-code and refresh grants are sent to Oura once; one-time grants are never blindly replayed.
- Refreshes are single-flight in one app instance, serialized across tabs with Web Locks, and persisted with an optimistic Firestore transaction.
- Only confirmed unrecoverable credential errors become a durable reconnect state. Rate limits, timeouts, network failures, server failures, and storage failures remain retryable.
- Full sync fetches and stages every Oura result before replacing stored records. It prunes obsolete records only after data writes succeed and publishes freshness metadata last.
- Saved Firestore scores hydrate the UI before background Oura refreshes begin, so retryable failures never replace valid scores with loading or reconnect states.
- Profile-local dates use monotonic timezone evidence from sessions, workouts, or sleep-time windows. UTC heart-rate samples are never treated as local offsets, including for legacy stored profiles.
- Oura retries are bounded, jittered, timeout-protected, and honor `Retry-After`.

## Oura export contract

- The canonical JSON export follows the 19 user collections in Oura V2 OpenAPI snapshot 1.37. It preserves source IDs, units, nulls, nested samples, and full UTC timestamps.
- Raw JSON and per-collection CSV exports use the unfiltered synced snapshot. Profile ring-break exclusions and selected date ranges apply only to the curated analysis CSVs.
- Access tokens, refresh tokens, app-only profile names, and Firestore `updatedAt` fields are never included. CSV cells are formula-escaped.
- A schema-matched Full Sync is required before the export is labeled a full-sync snapshot. The manifest records scopes, collection counts, coverage dates, and endpoint diagnostics.
- The complete endpoint list and schema source are the current official [Oura V2 documentation](https://cloud.ouraring.com/v2/docs) and [OpenAPI snapshot](https://cloud.ouraring.com/v2/static/json/openapi-1.37.json). The checked-in `openapi-1.28.json` file is retained only as a historical snapshot.

## Sharing and credentials

This app retains its existing anonymous shared-circle access model: anyone with its address can read shared profiles and health data. It is not a private member-authenticated service. Oura credentials are held in server-only `ouraCredentials` documents; browsers cannot read credentials or write health-data projections. Background jobs and cron endpoints are server-owned. Changing the sharing model requires a separate authentication and authorization migration.

## Bounded records repair

Scheduled sync and the daily insights worker build records automatically. For an operator-run repair, pull server credentials into the ignored Vercel directory and run one bounded batch:

```bash
vercel env pull .vercel/.env.production.local --environment=production --yes
node scripts/rebuild-insights.mjs
```

The command uses the same worker as the protected cron endpoint, reports progress without credential values, and can be rerun to resume older history. `--profile <id>` restricts a batch to one existing profile. It does not change source health data. A service quota failure must be resolved before retrying.

## Verification artifacts

Local screenshots and Lighthouse reports belong in `artifacts/`, which is ignored because those files can contain real names and health metrics. Do not commit or publish them.

See [docs/redesign-report.md](docs/redesign-report.md) for the audit, decisions, measurements, root-cause analysis, and remaining work.
