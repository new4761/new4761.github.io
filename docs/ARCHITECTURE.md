# Pocket Tools Lottery Ops — Architecture Spec

**Status:** Draft v1 — awaiting user approval before implementation.
**Scope:** Draw-day operations platform for Thai lottery number generation, device pairing, queue, offline sync, and QR verification.
**Author:** Sisyphus (OhMyOpenCode) — 5 August 2026 session.
**Replaces:** None. Extends the existing `/tools/lottery/` generator and the Thai-news-aware regen pipeline already in production.

---

## 1. Vision

A web app that, on Thai lottery draw days (1st & 16th, ~14:30 ICT), lets an operator log in from any device, choose a role — **POS + display** (registers many slave displays for customer view) or **standalone** (single device) — and generate lottery picks driven by:

1. Monthly historical first-prize draws from `new4761/Thai_lottery_analysis` (current behaviour).
2. A 15%-capped news-aware regen factor from The Thaiger (current behaviour).
3. *(Planned)* Queue pressure from concurrent devices, so high-load draw-day sessions stay responsive.
4. *(Planned)* QR API verification of physical tickets when the device has connectivity.

The platform must work offline — Thai venue connectivity is unreliable — and sync deltas when reconnected. One display can only be paired with one POS at a time.

## 2. Existing state (the starting point)

- `new4761/new4761.github.io` — static GitHub Pages site, no backend, no deps.
- `/tools/lottery/` — generator page (358 historical draws, news.json factor, 1/3/5/10 multi-pick, transparency panel).
- `lottery.mjs` — `buildFirstPrizeModel`, `generateModelLotteryNumber`, `applyNewsBias` (15% cap).
- `app.mjs` — UI: loads CSV from `raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv`, loads `/news.json`, applies bias per toggle.
- `news.json` — produced by `.github/workflows/scrape-news.yml` (Thaiger scrape, 30-min 30-min polls bracketing 08:30 UTC draw, watchdog step).
- `tests/lottery.test.mjs` + `tests/scrape-news.test.mjs` — 14/14 tests, CI green.
- `Thai_lottery_analysis` — source-of-truth dataset, monthly GLO draws (latest `2026-08-01`), updated by a separate bot commit.

The current generator and news pipeline stay **as-is**. The platform layers **on top** via new paths under `/ops/` and a new backend.

## 3. Components

```
                              ┌────────────────────────────┐
                              │  Static site (Pages)        │
                              │  new4761.github.io         │
                              │                            │
                              │  /tools/lottery/  (today)  │
                              │  /ops/dashboard/ (new)      │
                              │  /ops/pos/      (new)       │
                              │  /ops/display/  (new)       │
                              │  /ops/queue/    (new)       │
                              │  /ops/verify/   (new)       │
                              │                            │
                              │  sw.js  (Service Worker)    │
                              └─────────┬──────────────────┘
                                        │ fetch
                                        ▼
                              ┌────────────────────────────┐
                              │  Worker backend            │
                              │  (Cloudflare Workers +     │
                              │   Durable Objects, or      │
                              │   equivalent — see §10)   │
                              │                            │
                              │  /api/auth         (POST)  │
                              │  /api/events       (CRUD)  │
                              │  /api/pairings     (CRUD)  │
                              │  /api/queue        (WALL)  │
                              │  /api/verify       (POST)  │
                              │  /api/sync         (POST)  │
                              └──────┬──────────┬──────────┘
                                     │          │
                                     ▼          ▼
                          ┌────────────┐  ┌──────────────────────┐
                          │ Durable    │  │ External             │
                          │ Objects    │  │  - GLO QR-verify API │
                          │ (event,    │  │    (TBD — see §11)   │
                          │  pairing,  │  │  - Thaiger (already  │
                          │  queue)    │  │    scraped by Action) │
                          └────────────┘  └──────────────────────┘
```

### 2.1 Static site (Pages, no change infra-wise)

| Path | Purpose | New? |
|---|---|---|
| `/tools/lottery/` | Existing solo generator | No |
| `/ops/dashboard/` | Operator logs in, sees event status, manages pairings | Yes |
| `/ops/pos/` | POS role: generates picks, broadcasts to paired displays | Yes |
| `/ops/display/` | Display role: shows picks from its paired POS | Yes |
| `/ops/queue/` | Real-time queue of pending QR scans / generation asks | Yes |
| `/ops/verify/` | QR scan flow: camera + verification against GLO API | Yes |
| `/sw.js` | Service Worker for offline shell + IndexedDB sync | Yes |

### 2.2 Worker backend (new)

The Pages site is read-only. A small backend is required for:
- Real-time pairing coordination (display ↔ POS handshake).
- Queue state across multiple devices.
- QR-verify proxy (CORS + secret handling).
- Offline sync conflict resolution.

**Recommended:** Cloudflare Workers + Durable Objects — single-file JavaScript, edge-deployed, ~$5/mo for our scale, no cold-start issues, KV for hot path, Durable Objects for per-event coordination.

**Alternatives:** Firebase Realtime Database + Cloud Functions (built-in realtime, larger lock-in); Supabase (Postgres + Realtime + Edge Functions); self-hosted small VPS. Detailed in §10.

### 2.3 External APIs

- **GLO QR-verify API** — TBD. The GLO website's "check reward" page (`https://www.glo.or.th/mission/reward-payment/check-reward`) resolves ticket numbers; the underlying XHR is undocumented and may need reverse-engineering or a third-party wrapper. The QR on Thai L6 tickets carries the 6-digit number; verifying it means looking up that number against a specific draw date.
- **Thaiger** — already scraped by the GitHub Action; reused as-is for news factor.

## 4. State machines

### 4.1 Device role selection

```
                  ┌──────────────┐
                  │  landing     │
                  │  /ops/       │
                  └──────┬───────┘
                         │
                         │ POST /api/auth {eventCode, deviceLabel}
                         ▼
                  ┌──────────────┐
                  │  authed      │
                  │  dashboard   │
                  └──────┬───────┘
                         │
                ┌────────┴────────┐
                │                 │
                ▼                 ▼
        ┌────────┐          ┌──────────┐
        │ POS    │          │ Display  │
        │        │          │          │
        │ "Pair  │          │ "Enter   │
        │  a new │          │  pairing │
        │  disp" │          │  code"   │
        └───┬────┘          └────┬─────┘
            │                    │
            │ POST /api/pairings │ POST /api/pairings
            │  {role: pos,       │  {role: display,
            │   newDisplay}      │   pairingCode}
            ▼                    ▼
        ┌────────────┐      ┌──────────────┐
        │ paired     │◄───────┤              │
        │ 0..N       │      │ paired       │
        │ displays   │      │ (1 POS only) │
        └────────────┘      └──────────────┘
```

**Invariant:** A display can be paired with at most one POS. Pairing is atomic — Durable Object per pairing code; first POST wins.

### 4.2 Display pairing handshake

```
POS                                Display                    Worker (DO)
 │                                  │                            │
 │ POST /api/pairings {newDisplay}  │                            │
 │  → returns pairingCode P        │                            │
 │                                  │                            │
 │  shows P as a 6-char code       │                            │
 │  (and QR with P, optional)      │                            │
 │                                  │                            │
 │                                  │ POST /api/pairings         │
 │                                  │   {pairingCode: P}         │
 │                                  │  → returns posId,           │
 │                                  │    pairingToken T          │
 │                                  │                            │
 │  WS /api/pairings/P/stream       │                            │
 │  ← {paired, displayId, T}       │                            │
 │                                  │                            │
 │  now both sides share T          │
 │  for broadcast                   │
 ▼                                  ▼                            ▼
```

### 4.3 Offline → online sync

```
device (offline)            device (online)            worker
     │                            │                        │
     │  user runs generate        │                        │
     │  → write to IDB queue      │                        │
     │  → user sees local pick    │                        │
     │                            │                        │
     │  connectivity restored    │                        │
     │  ──────────────────────►  │                        │
     │                            │ POST /api/sync          │
     │                            │  {deviceId, since,      │
     │                            │   pending: [...]}       │
     │                            │                        │
     │                            │  apply each in order    │
     │                            │  return {ack'd,         │
     │                            │   conflicts: [...]}     │
     │                            │  ◄─────────────────    │
     │                            │                        │
     │                            │  update IDB queue        │
     │                            │  (remove ack'd,         │
     │                            │   surface conflicts)    │
     │                            │                        │
```

**Conflict policy (v1):** Last-write-wins on queue position. Event data (current pairing, current picks) is server-authoritative; offline edits are read-only. Display position in queue is server-resolved on sync.

### 4.4 QR verification flow

```
device (online)            worker              GLO QR-verify API
     │                        │                     │
     │ camera scans QR        │                     │
     │ → parses ticket        │                     │
     │   {drawDate, number}   │                     │
     │                        │                     │
     │ POST /api/verify       │                     │
     │  {drawDate, number}    │                     │
     │                        │ POST (proxied)      │
     │                        │  with server-held   │
     │                        │  API key            │
     │                        │  → result           │
     │  ◄ {status, prizeTier, │                     │
     │     prizeAmountBaht,   │                     │
     │     source: "GLO"}     │                     │
     │                        │                     │
     │ render result           │                     │
     │ persist to IDB         │                     │
```

**Offline path:** scan persists to IDB queue, verifies on next sync.

## 5. API endpoints (worker backend)

All endpoints require `Authorization: Bearer <pairingToken>` except `/api/auth`.

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/auth` | `{eventCode, deviceLabel, role}` | `{deviceId, pairingToken?}` | Anonymous; event code is the gate. |
| POST | `/api/pairings` (POS role) | `{role: "pos"}` | `{posId, pairingCode, expiresAt}` | Creates a pairing code; gives POS a token. |
| POST | `/api/pairings` (display role) | `{pairingCode}` | `{posId, pairingToken}` | Resolves code; gives display its own token. |
| DELETE | `/api/pairings/:pairingCode` | — | 204 | Either side can sever. |
| GET | `/api/pairings/:pairingCode/stream` | — | WebSocket | Server-sent pairing state changes. |
| POST | `/api/queue` | `{type: "generate"\|"verify", payload}` | `{position, ticketId, status}` | Enqueue. |
| GET | `/api/queue/:ticketId` | — | `{status, result?}` | Polling friendly. |
| WS | `/api/queue/stream` | — | WebSocket | Real-time status of all device's tickets. |
| POST | `/api/verify` | `{drawDate, number}` | `{status, prizeTier?, prizeAmountBaht?, source, fetchedAt}` | Proxies GLO. |
| POST | `/api/sync` | `{deviceId, since, pending: [...]}` | `{acknowledged, conflicts: [...]}` | Drain offline queue. |

### 5.1 Auth model (v1)

Simple event-code gate — operator shares a 6-char event code with staff at the start of draw day. Not user accounts. This is intentional — adds friction for legitimate users but keeps the backend trivial and lets staff rotate per event.

Future: upgrade to GitHub OAuth or SMS OTP if abuse appears.

## 6. Storage shape

### 6.1 Durable Objects

One DO class `EventRouter` routes by eventId; per-event Durable Object owns all realtime state for that event:

```
EventRouter[eventId] = {
  meta: { createdAt, createdByDeviceId, expiresAt },
  pairings: {
    [pairingCode]: {
      posId, displayIds: [...],
      status: "open" | "paired" | "severed",
      createdAt
    }
  },
  queue: SortedSet<Ticket>,
  devices: {
    [deviceId]: { role, label, pairingTokenHash, lastSeen }
  },
  picks: [
    { generatedAt, deviceId, source: "history" | "news-biased", number, factors }
  ]
}
```

Single DO per event → linear reads per event are O(1) in-memory operations. Cross-event isolation is automatic.

### 6.2 KV (Workers KV) — for non-realtime hot reads

```
kv:events:{eventCode}          → eventId (lookup on auth)
kv:news:latest                  → mirror of news.json (optional CDN cache layer)
kv:csv:model:{date}             → cached tokenised model (optional perf)
```

### 6.3 Client-side IndexedDB schema

```
db: pocket-tools-ops
  store: queue           { ticketId, type, payload, status, createdAt, syncedAt }
  store: picks            { id, number, factors, generatedAt, deviceId, offline: bool }
  store: pairings         { pairingCode, posId, status, role, token }
  store: meta             { deviceId, eventCode, lastSyncedAt, revision }
```

Service Worker (`/sw.js`) caches the app shell, `/news.json`, and the most recent CSV model. Generation works offline.

## 7. Queue system

**Why:** On draw day, hundreds of devices may generate picks or scan QR simultaneously. The model build is ~5ms in-browser, but verify hits a third-party API (~500ms–3s). Without a queue, verify requests pile up and degrade battery/CPU on the device.

**Shape:**
- Worker receives a queue request, assigns `ticketId`, persists to DO state.
- DO processes items FIFO; for verify, calls GLO API with debounce (10 reqs/s ceiling, configurable per event).
- Device streams status via WS; rendering happens on completion.
- Offline devices write to local IDB queue and POST on sync.

**Backpressure:** When queue length > N (config per event), `/api/queue` returns `429` with `Retry-After`; the client backs off exponentially (1s → 2s → 4s → 8s, cap 30s) before re-enqueuing locally. The IDB queue never rejects — devices keep working offline.

## 8. Offline mode

### 8.1 Service Worker

`/sw.js` (new file) caches:
- App shell (HTML, CSS, JS) — `precinct` strategy.
- `/news.json` — stale-while-revalidate.
- `lottery_results.csv` — cached for 7 days, refresh on next online.

Generation works offline because `buildFirstPrizeModel` is pure JS over the cached CSV.

### 8.2 IndexedDB

Per §6.3. Every action writes to IDB first, then attempts server POST. Failures (offline or 5xx) stay in IDB with `status: "pending"`.

### 8.3 Sync

On `online` event (or polling every 60s if `navigator.onLine` is true), client calls `/api/sync` with `since: lastSyncedAt` and any `pending` items in chronological order. Server applies each in order; returns acknowledged IDs and conflicts.

**Conflict resolution (v1):** Last-write-wins on queue position. Event data (current pairing, current picks) is server-authoritative; offline edits are read-only. Display position in queue is server-resolved on sync.

**Future:** CRDT for picks if multiple POSes' picks are merged into a shared display feed.

## 9. Deployment shape

```
GitHub
  ├── new4761/new4761.github.io (Pages, static)
  │     └── pages-build-deployment (existing workflow)
  │
  ├── new4761/ops-worker (new repo)
  │     └── wrangler.toml
  │     └── src/index.ts
  │     └── .github/workflows/deploy.yml (wrangler deploy on push)
  │
  └── new4761/Thai_lottery_analysis (unchanged, monthly CSV bot)

Cloudflare
  ├── Workers: pocket-tools-ops.<account>.workers.dev (or custom domain)
  ├── KV namespace: pocket-tools-ops-kv
  └── Durable Objects: EventRouter class (one per active event)
```

**Cost ceiling:** Workers free tier = 100k reqs/day. Paid tier ($5/mo) = 10M reqs/month. Durable Objects ~$0.15/million requests + $12.50/million GB-s. <$20/mo expected for a single monthly draw-day with ~100 devices.

## 10. Backend choice — three options

| Option | Pros | Cons |
|---|---|---|
| **Cloudflare Workers + Durable Objects (Recommended)** | Edge-deployed, low latency in Thailand, dirt cheap, single-file JS, perfect for stateful per-event coordination | Durable Objects learning curve, vendor lock-in |
| **Firebase Realtime Database + Cloud Functions** | Built-in realtime, mature offline SDK, simpler pairing WS | Heavy SDK bundle (fights no-deps philosophy on the static site), more expensive at scale, Google lock-in |
| **Supabase Postgres + Realtime + Edge Functions** | SQL when needed, mature, generous free tier | Edge Functions are Node-only, Durable Object equivalent requires reasonable Postgres design |

**Recommendation: Cloudflare Workers + Durable Objects** because:
1. The site is intentionally no-deps; the backend should mirror that.
2. Pairing state is per-event, short-lived, fits the DO actor model cleanly.
3. Global edge deployment matters in Thailand; Cloudflare PoP in BKK.
4. Cost is negligible for the actual scale (draw happens twice monthly).

## 11. Open questions

These need user decisions before implementation:

1. **GLO QR-verify API surface.** The GLO site's `check-reward` page resolves ticket numbers via an XHR I haven't reverse-engineered yet. Three paths:
   - (a) Reverse-engineer the XHR; risk: GLO changes it without notice.
   - (b) Use an existing third-party wrapper (Thaiger has one? thairesults.com?); may need their permission or cost.
   - (c) Build our own simple OCR for PDFs (heavyweight, but no third-party dependency).
   - **Blocking for `/ops/verify/`** until decided.

2. **Event code distribution.** How does an operator share the 6-char event code with staff at draw day? SMS? Sign? In-app share sheet? Needs UX decision.

3. **Multi-tenant or single-tenant?** Should this platform be just for you + your staff, or offered as a hosted service for other lottery operators? Affects auth model and storage isolation.

4. **Pick broadcast latency target.** Is <100ms required for POS → display echo, or is <1s acceptable? Determines whether we use WebSocket fan-out or HTTP polling.

5. **Persisted picks retention.** How long does the server keep picks for an event before garbage-collecting? Affects Durable Object lifecycle (DOs cost per GB-s).

6. **Queue size ceiling.** What's the max parallel devices per event we should plan for? 10? 100? 1000? Affects DO sizing and backpressure thresholds.

7. **Domain.** Stay on `new4761.github.io/ops/` (mixed concerns), or move ops to a custom subdomain like `ops.new4761.dev` (cleaner separation, requires DNS)?

## 12. Migration path

### Phase 0 (current — done)
- Static generator on `/tools/lottery/`.
- News-aware regen via Thaiger scraper.
- 14/14 tests, CI green, watchdog green.

### Phase 1 — Pairing (no backend yet)
Add `/ops/pos/` and `/ops/display/` static pages. Pairing uses a QR-encoded URL with `?pairingCode=P` — no backend; just state encoded in the URL. Display sends picks via `BroadcastChannel` API works on same-origin only, so this is single-device-ish. Validates UX without backend cost.

**Exit:** user-facing pairing UI exists and you can dogfood it on a single device.

### Phase 2 — Worker backend MVP
Stand up `new4761/ops-worker` repo with Cloudflare Workers + Durable Objects. Implement `/api/auth`, `/api/pairings`, `/api/queue` (just generate), `/api/sync`. Wire Service Worker for offline shell.

**Exit:** two devices on the same event code can pair and broadcast picks; offline generation works.

### Phase 3 — Queue + offline sync hardening
Add WS streams, backpressure, IDB conflict retry, queue UI `/ops/queue/`.

**Exit:** 100+ concurrent devices on a test event with healthy backpressure behaviour.

### Phase 4 — QR verify
Once §11 question 1 is resolved: implement `/ops/verify/`, `/api/verify`, scanner UI (`BarQrCodeDetector` API or a tiny library if browser support is sparse).

**Exit:** Scan a Thai L6 ticket and see prize tier if won.

### Phase 5 — News factor integration with ops
Today the news factor runs only on the static generator. Wire `/api/queue` to optionally serve news-biased picks backed by the same `news.json` (already cached in KV per §6.2) so POSes get the same factor.

**Exit:** POS generates via API and gets news-biased picks, identical to what the static generator produces.

## 13. Failure modes

| Mode | Mitigation |
|---|---|
| Worker unavailable (Cloudflare outage, etc.) | Static site still serves `/tools/lottery/` (today's behaviour). Pairing/queue/verify unavailable, but core generator works. |
| GLO QR-verify API down or rate-limits us | Backoff, queue. Tell operator "verify unavailable, retrying when service returns." IDB queue retains scans. |
| Thaiger stops publishing or HTML changes | Watchdog step in `scrape-news.yml` fires `::error::`. News factor silently falls back to pure-history mode; users see "News data unavailable — pure-history mode." Already implemented. |
| Durable Object state corruption | Each event is a single DO; restart rebuilds from KV snapshots (which we will write every minute while event is active). Worst case lose ≤1 minute of state. |
| Client-side IDB quota exceeded | Oldest `picks` records are dropped first; queue records always retained until ack'd. Surface a UI warning. |
| Pairing race condition (two displays try same code) | DO serializes; first POST wins; second gets `409 Conflict` and the user sees "Pairing code already taken." |
| Stale pairing token | Token is per-device; if device retries after expiry, server returns `401`; client reauths. |

## 14. Security & privacy

- **No PII collected.** Devices are identified by a server-generated UUID. No name, no phone, no email.
- **Pairing tokens** are 256-bit random values, hashed at rest in the DO. Stored in client localStorage.
- **Event codes** are 6-char random uppercase alphanumerics, rotated per event. Stored as `bcrypt(code)` in KV.
- **GLO QR-verify API key** (when §11.1 is solved) is held only in Worker secret store; never exposed to client.
- **HTTPS only** — Cloudflare enforces; Pages already enforces. Service Worker requires it.
- **CSP** — `default-src 'self'` plus exceptions for `raw.githubusercontent.com` (CSV) and the worker domain. Already partially in place; needs CSP header from the Worker.
- **Rate limiting** — per-device rate ceiling on `/api/queue` and `/api/verify` (configurable per event, default 10/min/device).
- **Audit log** — every pairing, queue push, and verify call gets a record in DO state, exported to KV daily for replay.

## 15. Testing strategy

| Layer | What runs | Where |
|---|---|---|
| Static generator + bias math | `node --test` (14/14 today) | GitHub Actions `test.yml` (already green) |
| Scraper snapshot | `tests/scrape-news.test.mjs` against fixture | Same |
| Service Worker / IDB | Playwright unit tests (page.evaluate) | New `tests/sw.test.mjs` |
| Worker endpoints | `unstable_dev` from `wrangler dev` + `node --test` | New `ops-worker` repo |
| DO state machines | Stateful integration tests against local DO simulator | `ops-worker` repo |
| End-to-end pairing/queue | Playwright across two browser contexts with mock Worker | New `tests/e2e/` |
| Live draw-day smoke | Manual: trigger one device as POS, one as display, verify flow | Documented in `docs/ops-runbook.md` |

## 16. Out of scope for v1

- User accounts / OAuth.
- Multi-tenant hosting (other operators).
- Mobile native apps (PWA only via Service Worker + manifest).
- Billing or paid plans.
- Postgres storage (Durable Objects + KV only).
- Real-time collaboration on the static generator (`/tools/lottery/` stays static).
- GLO Open Data CKAN file download scraper (stat-previous is Nuxt SPA + PDF; explicitly documented as deferred in the README).

## 17. References

- Live generator: https://new4761.github.io/tools/lottery/
- Tracking issue: https://github.com/new4761/new4761.github.io/issues/1
- Thaiger scraper: [`scripts/scrape-news.mjs`](../scripts/scrape-news.mjs)
- Model + bias code: [`lottery.mjs`](../lottery.mjs)
- Tests: [`tests/lottery.test.mjs`](../tests/lottery.test.mjs), [`tests/scrape-news.test.mjs`](../tests/scrape-news.test.mjs)
- GLO Open Data catalog: https://gdcatalog.glo.or.th/en/dataset/dataset_c4-9_01 (Nuxt SPA, not server-side scrapeable)
- GLO check-reward page: https://www.glo.or.th/mission/reward-payment/check-reward (XHR shape TBD — §11)