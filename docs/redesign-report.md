# Davis Watches You Sleep product audit and redesign report

Date: 2026-07-25
Scope: complete repository and rendered-product review, information architecture, design system, responsive UI, accessibility, performance, Oura credential lifecycle, synchronization integrity, tests, and documentation.

## Outcome

The application is now organized around four user jobs—Today, Leaderboard, Trends, and More—rather than exposing every feature as an equal top-level mode. Today opens with rank and the three Oura scores, then reveals deeper sleep, heart/body, activity, and contributor detail on demand. URLs are stable and browser-history aware. The unauthenticated entry experience is a lightweight welcome/profile chooser and does not load the dashboard or start health-data queries. The original “Davis Watches You Sleep” identity remains the product’s voice: the interface is calmer, but the two-person rivalry, bragging rights, and gently ridiculous sleep surveillance are still part of the experience.

The visual language is now restrained warm clay: an oat canvas, cream surfaces, deep evergreen actions, Newsreader editorial headings, Manrope body copy, IBM Plex Mono measurements, and a consistent raised/recessed grammar. Borders carry the hierarchy; dual clay shadows are reserved for raised or interactive objects, while selected and pressed states use inset treatment. Page-scale gradients, glass blur, decorative sparkles, and card-per-stat marketing compositions were removed. The previous overlapping soft-shadow, translucent-card, mobile-platform, and one-off inline systems were consolidated behind semantic tokens and shared primitives.

Oura refresh behavior is substantially more resilient. The implementation prevents common stale-write and refresh-race failures, distinguishes transient failures from real reconnect requirements, respects server retry guidance, and makes full-sync persistence truthful. A separate architectural security limitation remains and is called out explicitly below.

## Audit method

The audit combined:

- source inventory and dependency/build review;
- mobile and desktop walkthroughs of every primary view and all seven insight tools;
- competition creation/invite entry review without submitting destructive flows;
- keyboard, focus, dialog, overflow, target-size, and responsive checks;
- network/request-count inspection;
- deployed and local Lighthouse runs;
- deterministic unit/integration tests around token rotation, retries, sync replacement, and partial failure;
- production Vite and Vercel builds.

Baseline screenshots and reports are retained locally under ignored `artifacts/` storage because they contain real member names and health data.

## Original product inventory

The original dashboard combined seven top-level modes—Today, Compare, Compete, Trends, Streaks, Insights, and Export—while Insights added eight more tabs and duplicated Streaks. Most state was local rather than URL-backed. The 4,000-line dashboard eagerly imported large chart and modal graphs, the first screen rendered extensive below-the-fold detail, and profile selection initiated broad data work.

Primary user jobs identified during the audit:

1. See today’s standing and whether data is current.
2. Compare members and understand score context.
3. Follow longer-term trends, streaks, and relationships.
4. Run a friendly competition.
5. Invite or connect another person.
6. Export or manage profile/sync settings.

## Information architecture

| Primary destination | Purpose | Secondary views |
| --- | --- | --- |
| Today | Rank, average, three scores, freshness, daily essentials | Sleep, heart/body, activity, contributors via disclosure |
| Leaderboard | Shared comparison and friendly play | Compare, Competitions |
| Trends | Personal and group change over time | Overview, Streaks, Explore |
| More | Infrequent actions | Invite, refresh, add account, settings, export |

Desktop and mobile now share this model. Mobile uses a four-item safe-area-aware bottom bar; desktop uses the same four labels in the header. Secondary segmented controls appear only inside their parent destination. Routes and back/forward navigation preserve the selected destination, while Explore persists its tool in `?insight=`.

## Design-system decisions

- Semantic roles replace feature-specific color literals for canvas, surface, border, text, focus, status, and metric categories.
- Shared `Button`, `Card`, `Badge`, `Field`, `Input`, `Select`, `SegmentedControl`, `Skeleton`, `StatePanel`, and `Dialog` primitives define interaction and state behavior.
- Dialogs trap focus, close on Escape, restore focus, expose names/descriptions, and adapt from a mobile sheet to a desktop dialog.
- Interactive metric cards are real buttons; missing data is consistently rendered as an em dash.
- Controls target at least 44×44 CSS pixels, bottom navigation includes device safe-area padding, and wide comparison tables gain a stacked mobile presentation.
- Motion is brief and functional, with reduced-motion overrides. Decorative gradients and elevation are restrained.
- Copy avoids unverifiable privacy claims, distinguishes saved freshness metadata from a live connection test, and does not tell users to reconnect for ordinary transient failures.

## Writing and analytical integrity

The product keeps its authored personality—“Davis Watches You Sleep,” “Today’s sleep surveillance,” “Currently under observation,” and friendly rivalry—while functional, consent, error, and synchronization copy stays literal. Most screens now use one personality beat followed by direct explanatory copy instead of stacked slogans.

The analytics language now matches the implementation:

- relationship views describe Pearson correlations from matched days, show the coefficient and sample size, and state that correlation does not establish cause;
- the what-if tool is labeled as a one-variable historical trend-line estimate, not a prediction of what will happen;
- pattern cards show sample coverage and observed percentage difference rather than invented confidence or impact scores;
- generic coaching, prescriptive tips, universal “optimal” claims, and unsupported medical interpretations were removed;
- contributor and sleep-stage detail is concise and explicitly framed as Oura/wearable estimation rather than diagnosis.

## Performance measurements

### Baseline

The deployed mobile homepage baseline (Lighthouse emulation) measured:

| Metric | Baseline |
| --- | ---: |
| Performance score | 50 |
| Accessibility score | 91 |
| Best practices | 100 |
| SEO | 91 |
| FCP / LCP | 3.55 s / 3.55 s |
| Total blocking time | 7.83 s |
| Time to interactive | 13.32 s |
| Cumulative layout shift | 0.097 |
| Requests / transfer | 74 / 10.78 MB |
| Main-thread work | 15.84 s |

The deployed page also issued repeated profile requests: six calls per daily endpoint and twelve heart-rate calls in one observed profile selection. Firestore profile listeners transferred approximately 9.8 MB. At 390 px viewport width, the root scroller was 512 px wide; Today overflowed to 408 px and one relationship view to 399 px. Today exposed 398 buttons and 217 tab stops, including 178 off-screen carousel items.

The comparable pre-change local production build emitted a 906.47 KB raw / 266.17 KB gzip entry bundle, a 357.37 KB / 88.94 KB Firebase chunk, and 83.06 KB / 14.95 KB CSS. Local Lighthouse scored 74 with 4.06 s FCP/LCP, 0.120 CLS, 7.49 MB transfer, and 8.07 s main-thread work.

### Implemented performance changes

- The dashboard is lazy-loaded only after a profile is selected.
- Settings, export, competitions, analytics tools, comparison tables, charts, contributors, and large detail dialogs load on demand.
- Closed daily disclosures do not initialize chart modules.
- Query focus/reconnect bursts are disabled; Oura handles a bounded retry policy and TanStack Query permits one orchestration replay instead of the default three.
- The 502 KB mislabeled JPEG favicon was replaced by a sub-kilobyte SVG.
- The redundant pre-dashboard profile-selection implementation was removed.
- The dashboard’s immediate chunk fell from 609.52 KB / 175.04 KB gzip during the redesign to 137.24 KB / 40.18 KB gzip after chart/modal splitting.

### Final performance

Two consecutive Lighthouse 12.8.2 mobile runs against the final local production build produced the same category and paint results:

| Metric | Final | Change from deployed baseline |
| --- | ---: | ---: |
| Performance score | 98 | +48 points |
| Accessibility score | 100 | +9 points |
| Best practices | 100 | unchanged |
| SEO | 100 | +9 points |
| FCP / LCP | 1.81 s / 1.81 s | 49% faster |
| Total blocking time | 0 ms | −7.83 s |
| Time to interactive | 1.81 s | 86% faster |
| Cumulative layout shift | 0.055 | 43% lower |
| Requests / transfer | 13 / 361.9 KB | 82% fewer / 97% less |
| Main-thread work | 0.50–0.56 s | at least 96% lower |

Final production chunks include 300.59 KB / 92.96 KB gzip for the entry, 357.37 KB / 88.94 KB gzip for Firebase, 137.24 KB / 40.22 KB gzip for Dashboard, and 87.75 KB / 16.53 KB gzip for CSS. The 309.95 KB / 95.39 KB Cartesian chart implementation is on demand rather than part of the initial experience.

## Oura disconnection root cause and remediation

### Root causes found

1. Refresh coordination existed only inside one provider instance, so tabs and devices could concurrently spend a single-use Oura refresh token.
2. Whole-profile writes built from stale snapshots could restore a consumed refresh token after another caller rotated it.
3. Broad string matching classified 429, 5xx, timeouts, storage failures, and generic refresh failures as permanent reconnect conditions.
4. Default query retries multiplied endpoint bursts, while data requests lacked a bounded, jittered, `Retry-After`-aware policy.
5. Missing expiry metadata caused inconsistent refresh timing.
6. Full sync cleared or merged storage in ways that could either lose history on fetch failure or retain records removed upstream; metadata could report success before all data was durable.
7. Token fragments and raw upstream detail could reach local cache identifiers and logs.

### Implemented behavior

- Same-instance single-flight and browser Web Locks coordinate refresh calls.
- Every refresh rereads the latest credentials and persists rotation through a compare-and-set Firestore transaction.
- A losing caller rereads a winner’s credentials rather than overwriting them; cross-device recovery uses bounded delayed rereads.
- Stale profile changes use field patches, not full-document replacement.
- Authorization-code and refresh grants get one proxy attempt because replaying a possibly consumed grant can destroy the only valid rotation.
- A refresh response must contain both an access token and a newly rotated refresh token.
- Only confirmed `400 invalid_grant`, an absent saved refresh token, an absent rotated refresh token, or missing required consent persists reconnect state.
- Network errors, timeouts, rate limits, 5xx responses, and Firestore failures remain retryable and retain previously successful query data.
- Idempotent Oura GETs use timeouts, bounded exponential backoff with jitter, and `Retry-After` when supplied.
- Full sync stages all retrieval first, writes replacement data, prunes obsolete records only after successful writes, stores freshness metadata last, and surfaces partial storage failures.
- Token-derived cache keys, token-bearing logs, and unsanitized OAuth error bodies were removed; OAuth responses are non-cacheable.

Deterministic tests cover same-instance concurrency, inverse-order rotation races, cross-tab winner recovery, invalid-grant classification, missing rotation, retryable failures, stale-write protection, GET retry timing, OAuth single-attempt behavior, full-sync replacement, metadata ordering, and partial storage failure.

## Security boundary that remains

This is the highest-priority unresolved issue. `firestore.rules` permits anonymous reads and writes, the browser subscribes to complete profile documents, and those documents contain plaintext Oura access and refresh credentials. Any visitor who can reach the Firebase project can extract, rotate, overwrite, or revoke member credentials. Browser-mediated refresh also has an irreducible gap: if Oura consumes a one-time grant but the successful proxy response is lost, the tab closes, or Firestore remains unavailable, the only replacement token can be stranded. Web Locks do not serialize separate devices.

Client-only changes cannot close this boundary without breaking the current schema/API compatibility requirement. Production remediation requires:

1. Firebase Authentication or another real member identity/authorization layer.
2. Server-only encrypted token custody.
3. A backend refresh-and-persist operation that durably saves rotation before acknowledging success.
4. Non-secret client profile projections and restrictive Firestore rules.
5. A distributed lease/idempotency strategy and token-free structured operational diagnostics.

Until that migration is complete, the app should be treated as a trusted-group prototype, not a secure health-data product.

## Dependency and repository hygiene

- Added an ESLint 10 flat configuration and unified `typecheck`, `lint`, `test`, `build`, and `verify` scripts.
- Removed the orphan login page, unused Heroicons dependency, dead mobile-platform primitives, obsolete analytics imports/assignments, redundant onboarding implementation, dead Gemini build definitions, and the oversized favicon.
- Added an environment template and a current README.
- Ignored local `artifacts/` and `coverage/` output to prevent accidental health-data commits.
- A non-breaking `npm audit fix` removed all critical and high production dependency findings. Eight moderate findings remain inside the `firebase-admin` Google Cloud dependency chain; npm proposes a breaking downgrade rather than a safe current-line fix.

## Final validation

- `npm run verify`: TypeScript passed; ESLint passed with zero warnings; 28 test files and 94 tests passed; the production Vite build passed.
- `vercel build`: the deployment-equivalent preview build completed successfully, including the Vite frontend and TypeScript server functions.
- Responsive route matrix: `/`, `/leaderboard`, `/leaderboard/compete`, `/trends`, `/trends/streaks`, `/trends/insights`, `/more`, `/more/export`, `/settings`, and the 404 state each had one main landmark, one page-level heading, and no horizontal overflow at 390 px. Effective control targets were at least 44×44 CSS pixels; the one 20 px checkbox is wrapped by a 109×44 px label target.
- Narrow-screen checks: competition and settings remained within a 320 px viewport; long Settings actions stack instead of squeezing their descriptions. The competition calendar preserves 44×44 px day cells inside an explicit focusable horizontal strip while the page, dialog, and picker panel themselves remain overflow-free.
- Tablet/desktop checks: representative routes at 768 px and 1,440 px had no horizontal overflow; desktop content remains capped at 1,024 px inside the 1,440 px viewport.
- Interaction checks: competition-builder, metric-detail, and sleep-stage-day dialogs expose modal semantics, move focus inside, lock body scrolling, close on Escape, and restore focus. Busy sync/removal/submission dialogs consistently block header, backdrop, and Escape dismissal. The information tooltip stayed within the mobile viewport.
- Loading checks: the welcome/profile chooser loaded the entry, Firebase, CSS, and profile subscription only—no Dashboard chunk or member-stat query—until a profile was selected.
- Browser runtime: no page errors or console messages were emitted during the final route and interaction pass.
- Lighthouse: two consecutive mobile runs scored 98 performance and 100 accessibility, best practices, and SEO, with 0 ms blocking time and 0.055 CLS.
- Repository checks: `git diff --check` passed; generated screenshots and reports remain ignored under `artifacts/` because they contain real names and health data.

## Prioritized next steps

1. **Block production expansion:** implement authenticated backend token custody and restrictive Firestore rules.
2. Add an emulator-backed contention test and a durable distributed refresh lease as part of that backend migration.
3. Replace the remaining browser-side all-profile subscription with authorized, minimal projections and paginated/query-scoped reads.
4. Add privacy-safe production telemetry for token lifecycle codes, sync duration, endpoint rate limits, and storage failures.
5. Continue decomposing the large dashboard and analytics service into domain modules, with route-level tests for each destination.
6. Self-host/subset the three display fonts if font-provider latency is material in production monitoring.
