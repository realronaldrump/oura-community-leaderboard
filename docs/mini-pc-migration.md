# Mini PC storage migration

## Current rollout state (September 10, 2026)

The isolated SQLite service and background timers are installed on the mini PC. The first source copy is paused by Firestore's exhausted read quota (zero documents copied at the initial check). **Production still uses Firestore. No data migration or cutover has completed.** The timers resume copying after a quota failure; they never activate a copy automatically.

Tailscale is connected, and the owner-authorized Funnel endpoint is running at `https://davis-mini-pc-1.tail59b3f5.ts.net:8443`. Its health check succeeds and private routes reject unauthenticated access with HTTP 401. The existing tailnet-only HTTPS service on port 443 is unchanged. Endpoint setup is complete; the source copy and verified cutover gates below remain pending. Do not replace the existing 443 service or expose the database file.

## Architecture and retention

- Vercel retains the existing UI, OAuth redirect, invitation URLs, and authenticated server gateway. `OURA_MINI_PC_URL` and server-only `OURA_MINI_PC_TOKEN` enable that gateway explicitly. Neither is enabled during initial copying.
- `VITE_OURA_API_URL` enables direct browser access to the mini PC's public document API and change stream. Set it only after activation. Never expose the transport token in a `VITE_` variable.
- The mini PC owns sync, records computation, webhook replay, and SQLite. It uses the existing anonymous shared-circle access model. Public access excludes credentials, migration archives, background jobs, and historical revisions.
- Every document mutation appends the prior/current history through immutable revision rows. Logical removals retain earlier payloads. Profile removal is disabled. No retention job deletes revisions, raw copy pages, source documents, or backups.
- The copier discovers every root and nested collection, including unknown collections and descendants of missing parent documents. It uses one fixed Firestore read timestamp per generation, paginates, preserves exact REST response pages and native field representations, and verifies document hashes independently against the archived pages. Quota errors are failures, never empty successful results.
- Completed copies require a verified SQLite backup and raw-page copy on a separate disk. Source rules and source Firestore documents remain available as an archive after cutover. The app's downloadable data export is not a complete database backup.
- The mini PC keeps a durable signed-webhook inbox, including raw bytes, retry status, and processed events. Busy or failed sync does not discard an event. Existing source credentials are copied privately; no reconnect should be required solely for migration.

## Installed paths and operations

All following paths are on `100.96.182.111`, owned by `davis`:

| Path | Contents |
| --- | --- |
| `/home/davis/oura-community-leaderboard/staging` | Bundled Node 22 service and workers |
| `/home/davis/oura-community-leaderboard/private/config.json` | Mode 600 credentials and configuration; never print or commit |
| `/home/davis/oura-community-leaderboard/data/oura.sqlite` | WAL database, current documents, permanent revisions and migration state |
| `/home/davis/oura-community-leaderboard/source-archive` | Exact successful source response pages, by copy generation |
| `/mnt/seagate20tb/oura-backups` | Independent SQLite backups, hashes, source pages, manifests and configuration backup |

`oura-storage.service` is a user systemd service bound to `127.0.0.1:8740`. `oura-worker@.service` runs bounded one-shot workers. Timers run copy and records each minute, inbox replay every 30 seconds, sync every 15 minutes, backup daily at 04:30, and webhook maintenance daily at 06:30 (mini PC system timezone). All sync/record/inbox workers wait for activation. Copy retries back off 30 minutes on source quota exhaustion. User lingering is enabled, so services survive SSH logout.

```bash
ssh 100.96.182.111 'systemctl --user status oura-storage.service --no-pager'
ssh 100.96.182.111 'systemctl --user list-timers "oura-*" --no-pager'
ssh 100.96.182.111 'curl -fsS http://127.0.0.1:8740/health'
ssh 100.96.182.111 'cd /home/davis/oura-community-leaderboard/staging && OURA_CONFIG_FILE=/home/davis/oura-community-leaderboard/private/config.json node operator.mjs status'
```

Health `ready: false` means staging, not data loss. `operator status` displays only migration state and collection counts. Private HTTP status requires the transport key. Never put that key in shell history or a public report.

Build service bundles on the development Mac with `node scripts/build-mini-pc.mjs`, then copy `.vercel/mini-pc-release/` additively into the remote staging directory. Use the existing lockfile with `npm ci --omit=dev --ignore-scripts` there. Copy the checked-in `mini-pc/systemd/` units to the user's systemd directory and reload systemd. Deployment must not touch the data, private configuration, raw archives, backups, or other applications.

## Cutover sequence — required gates

1. Wait for the initial recursive copy to report `verified`, with a nonempty manifest and an independent verified backup. Inspect root/subcollection counts and representative source records, including credentials, exclusions, competitions, raw samples, and record metadata. Review unknown collections; do not filter them out.
2. Verify the public Funnel endpoint is healthy and private routes reject anonymous access. Set the **server-only** production Vercel URL/token and redeploy. Leave `VITE_OURA_API_URL` unset. Verify `/api/storage-status` reports `backend: mini-pc` with the actual mini PC build hash. At this point new server writes are paused on staging and signed webhooks queue durably.
3. On the mini PC, with the same working directory/config as above, run `node operator.mjs freeze`. It requires the initial verified backup and deployed proxy, backs up the original Firestore rules, and denies client writes while preserving read rules. Verify the freeze receipt. Do not run two Oura refresh-token writers.
4. Wait at least 90 seconds for old Vercel invocations to drain. Run `node operator.mjs new-copy` once; let the copy timer resume it. This creates a fresh fixed-time generation after the write freeze and retains the earlier copy. Require the final generation's counts, page hashes, document manifest, and separate backup to verify.
5. Run `node operator.mjs activate`. It checks the deployed proxy, unchanged source freeze, post-freeze timestamp, verified manifest, and profile inventory. Import and publication are one SQLite transaction. It refuses to overwrite an already active local database. No HTTP route can bypass this operator gate.
6. Set production `VITE_OURA_API_URL` to the verified HTTPS origin and redeploy. The browser now reads the same local database as the server. A transport failure never falls back to Firestore. Verify the deployed commit, connection, sync, all four destinations, invitation handling, representative record evidence, raw export counts, and backup health. Let bounded records workers backfill the archive.

Do not restore the old Firestore writer after local activation: it would omit new local changes and risk token races. Recovery after activation restores a verified SQLite backup into a **new file**, replays retained revisions/inbox as appropriate, and updates configuration only after checking it. Retain both files and all source archives. Before activation, keep original source access intact and investigate any count/hash disagreement instead of bypassing a gate.

## Verification

`npm run verify` checks the app and server imports. On Node 22 with native SQLite:

```bash
node --test mini-pc/document-store.test.mjs
```

Tests cover transaction conflicts and atomicity, retained revisions, full native wire values, unknown/missing-parent collection discovery, unusual document IDs, byte-exact webhook replay, quota pauses, source rules, independent backups, and rollback on failed activation. Browser transport tests cover snapshot pagination, subscriptions, conflicts and no fallback. Production data-dependent checks remain pending until Firestore permits the copy.
