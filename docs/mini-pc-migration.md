# Mini PC storage and Oura refetch

## Current rollout state (September 11, 2026)

The owner chose a fresh Oura refetch instead of migrating Firestore. The mini PC is activated in `oura-refetch` mode, and production uses its SQLite storage through the existing Vercel app. **The Firestore copy timer is disabled.** Firestore documents, prior copy state, and local archives remain untouched. No historical health data was copied from Firestore.

Tailscale is connected, and the owner-authorized Funnel endpoint is running at `https://davis-mini-pc-1.tail59b3f5.ts.net:8443`. Its health check succeeds and private routes reject unauthenticated access with HTTP 401. The existing tailnet-only HTTPS service on port 443 is unchanged. Do not replace the existing 443 service or expose the database file.

Reconnect each Oura account in the deployed app. The first sync fetches recent data; a one-minute history worker then resumes older calendar windows, sharing work across connected profiles. It scans back to 2000 (before Oura history), records successful empty windows, and retries failed collections. Only data that Oura still makes available and the account authorizes can be refetched. App-only exclusions, profile customizations, competitions, and invitations cannot be recreated from Oura; their originals remain in Firestore. New app activity is stored only on the mini PC. Existing browser caches are retained under their old keys and are not shown in the new storage mode.

## Architecture and retention

- Vercel retains the existing UI, OAuth redirect, route structure, and authenticated server gateway. Production `OURA_MINI_PC_URL` and server-only `OURA_MINI_PC_TOKEN` enable the gateway.
- Production `VITE_OURA_API_URL=/storage` uses a same-origin Node relay for the mini PC's public document API and change stream. This avoids browser local-network permissions and intermittent edge-rewrite `DNS_HOSTNAME_EMPTY` failures. The relay permits only the three public operations and reconnects change streams within the function timeout. Vercel relays requests; SQLite on the mini PC owns all stored data. The browser does not initialize Firebase in this mode. Never expose the transport token in a `VITE_` variable.
- Vercel-to-mini-PC requests recover `ENOTFOUND`/`EAI_AGAIN` using a cached public DNS-over-HTTPS answer for the configured Tailscale hostname. TLS still verifies the original hostname, private addresses are rejected, and credentials never reach the DNS resolver. Timeouts and uncertain connection failures are not replayed, preserving single-use OAuth grants.
- Resolution tries Cloudflare and Google independently. If both lack a usable answer, `OURA_MINI_PC_PUBLIC_IPS` supplies operator-verified public ingress addresses for only the configured hostname; normal resolution resumes after 15 seconds. Revalidate this optional setting against public DNS when changing the Funnel endpoint. It never disables certificate validation or selects a different hostname.
- Change streams carry durable revision IDs. The relay forwards the EventSource resume cursor; reconnects replay only changed public collections, including writes from background workers. Identical simultaneous browser reads share one request, and hidden tabs close their stream and catch up on return. The 45-second relay timeout no longer forces full subscription rereads.
- The mini PC owns sync, records computation, webhook replay, and SQLite. It uses the existing anonymous shared-circle access model. Public access excludes credentials, migration archives, background jobs, and historical revisions.
- Every document mutation appends the prior/current history through immutable revision rows. Logical removals retain earlier payloads. Profile removal is disabled. No retention job deletes revisions, raw copy pages, source documents, or backups.
- The copier discovers every root and nested collection, including unknown collections and descendants of missing parent documents. It uses one fixed Firestore read timestamp per generation, paginates, preserves exact REST response pages and native field representations, and verifies document hashes independently against the archived pages. Quota errors are failures, never empty successful results.
- The unused copy workflow requires a verified SQLite backup and raw-page copy on a separate disk. Fresh refetch activation instead backs up the empty local store and refuses to overwrite any existing current documents or active storage. Source Firestore documents remain available separately. The app's downloadable data export is not a complete database backup.
- The mini PC keeps a durable signed-webhook inbox, including raw bytes, retry status, and processed events. Busy or failed sync does not discard an event. Refetch mode requires a fresh Oura connection; credentials are stored only by the local server after that connection.

The September 11 CPU repair removed repeated full subscription reads on relay reconnects. During deployment, the system volume was found full and Oura workers were failing. The database was moved within the mini PC to its larger ext4 volume, with writers stopped and every file hash verified before removing the original duplicate. The database path remains stable through a symlink; independent backups still belong on the separate Seagate drive. No health history or retained revisions were pruned.

## Installed paths and operations

All following paths are on `100.96.182.111`, owned by `davis`:

| Path | Contents |
| --- | --- |
| `/home/davis/oura-community-leaderboard/staging` | Bundled Node 22 service and workers |
| `/home/davis/oura-community-leaderboard/private/config.json` | Mode 600 credentials and configuration; never print or commit |
| `/home/davis/oura-community-leaderboard/data/oura.sqlite` | Stable database path; `data` links to `/everystreet/oura-community-storage/data` on the larger Linux volume. WAL database, current documents, permanent revisions and migration state |
| `/home/davis/oura-community-leaderboard/source-archive` | Exact successful source response pages, by copy generation |
| `/mnt/seagate20tb/oura-backups` | Independent SQLite backups, hashes, source pages, manifests and configuration backup |

`oura-storage.service` is a user systemd service bound to `127.0.0.1:8740`. `oura-worker@.service` runs bounded one-shot workers. Timers run history refetch and records each minute, inbox replay every 30 seconds, sync every 15 minutes, backup daily at 04:30, and webhook maintenance daily at 06:30 (mini PC system timezone). Copy is disabled. All workers wait for activation and history refetch waits for an Oura connection. User lingering is enabled, so services survive SSH logout.

```bash
ssh 100.96.182.111 'systemctl --user status oura-storage.service --no-pager'
ssh 100.96.182.111 'systemctl --user list-timers "oura-*" --no-pager'
ssh 100.96.182.111 'curl -fsS http://127.0.0.1:8740/health'
ssh 100.96.182.111 'cd /home/davis/oura-community-leaderboard/staging && OURA_CONFIG_FILE=/home/davis/oura-community-leaderboard/private/config.json node operator.mjs status'
```

Health `ready: false` means staging, not data loss. `operator status` displays only migration state and collection counts. Private HTTP status requires the transport key. Never put that key in shell history or a public report.

Build service bundles on the development Mac with `node scripts/build-mini-pc.mjs`, then copy `.vercel/mini-pc-release/` additively into the remote staging directory. Use the existing lockfile with `npm ci --omit=dev --ignore-scripts` there. Copy the checked-in `mini-pc/systemd/` units to the user's systemd directory and reload systemd. Deployment must not touch the data, private configuration, raw archives, backups, or other applications.

## Unused copy-based cutover — historical procedure

**Do not run this procedure for the current refetch setup.** The owner explicitly chose `node operator.mjs activate-refetch` after a verified local backup. Re-activation refuses an already active store; it never resets connected profiles. The old workflow below is retained for reference only.

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
node --test mini-pc/*.test.mjs
```

Tests cover transaction conflicts and atomicity, retained revisions, full native wire values, unknown/missing-parent collection discovery, unusual document IDs, byte-exact webhook replay, quota pauses, source rules, independent backups, fresh activation, failed activation, and resumable refetch. Browser tests cover snapshot pagination, subscriptions, conflicts, no fallback, no Firebase initialization, and isolation of old caches. Live Oura data and record evidence can be checked after the owner reconnects an account.
