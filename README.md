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

- `/` — Today: rank, core scores, freshness, and expandable details
- `/leaderboard` — member comparison
- `/leaderboard/compete` — competitions and invitations
- `/trends` — progress overview
- `/trends/streaks` — streaks
- `/trends/insights?insight=…` — seven analytical tools
- `/more` — secondary actions
- `/more/export` — export
- `/settings` — profile, sync, exclusions, webhook, and data controls

The public welcome screen does not load the dashboard bundle or issue member-stat queries. Heavy charts, analytics, export, competitions, and detail dialogs are split into on-demand chunks.

## Synchronization invariants

- Authorization-code and refresh grants are sent to Oura once; one-time grants are never blindly replayed.
- Refreshes are single-flight in one app instance, serialized across tabs with Web Locks, and persisted with an optimistic Firestore transaction.
- Only confirmed unrecoverable credential errors become a durable reconnect state. Rate limits, timeouts, network failures, server failures, and storage failures remain retryable.
- Full sync fetches and stages every Oura result before replacing stored records. It prunes obsolete records only after data writes succeed and publishes freshness metadata last.
- Saved Firestore scores hydrate the UI before background Oura refreshes begin, so retryable failures never replace valid scores with loading or reconnect states.
- Profile-local dates use monotonic timezone evidence from sessions, workouts, or sleep-time windows. UTC heart-rate samples are never treated as local offsets, including for legacy stored profiles.
- Oura retries are bounded, jittered, timeout-protected, and honor `Retry-After`.

## Important security limitation

This repository’s current compatibility contract has no Firebase Authentication or server-side member authorization. The checked-in Firestore rules allow anonymous profile/stat access, and complete profile documents contain Oura credentials. That means the current deployment is **not suitable for sensitive production use**, despite the client-side lifecycle improvements.

The required production remediation is an authenticated backend that owns Oura tokens, performs refresh-and-persist atomically, returns only non-secret profile/data projections, and enforces restrictive Firestore rules. That change requires an authorization architecture and API/data-contract migration; it cannot be made safely as a transparent client-only patch.

## Verification artifacts

Local screenshots and Lighthouse reports belong in `artifacts/`, which is ignored because those files can contain real names and health metrics. Do not commit or publish them.

See [docs/redesign-report.md](docs/redesign-report.md) for the audit, decisions, measurements, root-cause analysis, and remaining work.
