# MVP Architecture: Forking and Adapting Survev

## 1. Decision

Fork Survev and adapt its existing browser client, authoritative real-time game server, shared protocol, map system, and rendering assets into a solo top-down extraction game.

This is an adaptation, not a rewrite. The fork supplies the hard real-time foundation: top-down movement and combat, collision, rendering, binary networking, match processes, loot objects, armor, healing, a shrinking zone, and browser delivery. New work focuses on the extraction loop, persistent stash/economy, email/password accounts, and AI.

## 2. MVP Product Boundaries

| Area | Decision |
| --- | --- |
| Platform | Desktop web browser; keyboard and mouse |
| Mode | Public solo queue only |
| Match | 12 player slots, with simple combat bots filling vacant slots |
| Duration | 12-minute hard limit |
| Map | Full Survev map for the MVP |
| Assets | Reuse Survev map, gun, combat, health, bullet, and related visual assets |
| Objective | Equip, loot, fight, discover extraction intel, extract, keep loot |
| Death/timeout | Lose all deployed and carried raid gear |
| Extraction | Fixed possible locations, revealed by intel; 10-second channel interrupted by damage |
| Progression | Account-bound persistent stash and a fixed-price vendor |
| Combat equipment | Lootable scopes and Survev-style throwables are included |

Out of scope: squads, extra maps, weapon attachments other than scopes, crafting, insurance, protected containers, quests, player marketplace, mobile, ranked mode, cosmetics, and voice chat.

## 3. Technology Stack

| Layer | Choice | Role |
| --- | --- | --- |
| Language | TypeScript on Node.js 22+ | One language across client, game server, API, data definitions, and protocol |
| Client build | Vite | Builds and serves the desktop web client |
| Rendering | PixiJS Legacy | Renders the top-down world, sprites, bullets, loot, and UI elements |
| Real-time transport | uWebSockets.js with Survev's binary protocol | Low-latency WebSocket gameplay connection |
| Simulation | Server-authoritative Node.js game processes | Validates input, movement, combat, loot, extraction, and match outcomes |
| API | Hono with Zod validation | Authentication, stash, vendor, match allocation, and profile endpoints |
| Database | PostgreSQL with Drizzle ORM/migrations | Accounts, stash, transactions, raid state, and match history |
| Cache | Redis | Existing optional cache; use for rate limiting and short-lived matchmaking/raid coordination |
| Reverse proxy | Nginx | TLS termination, static client files, API proxying, and WebSocket proxying |
| Service management | systemd on Ubuntu Linux | Restarts API and game-server processes after failure or reboot |

No new rendering engine, game framework, or microservice platform is needed for the MVP.

## 4. Fork Architecture

```text
Browser
  ├─ Vite/PixiJS client
  ├─ HTTPS REST requests ───────────────► Nginx ─► Hono API
  └─ WSS gameplay connection ───────────► Nginx/direct TLS ─► Game server
                                                               └─ Match child process
                                                                    ├─ authoritative simulation
                                                                    ├─ AI controller
                                                                    └─ binary state updates

Hono API ───────────────────────────────────────────────────────► PostgreSQL
  └─ Redis (rate limits, short-lived coordination)
```

### 4.1 Existing Survev Components to Retain

| Existing area | Keep | Adaptation |
| --- | --- | --- |
| `client/` | PixiJS renderer, camera, input, game-object views, resource loading | Add extraction markers, intel UI, stash/vendor screens, weight display, and extraction progress UI |
| `server/src/game/` | Game loop, object registry, collision, bullets, weapons, loot, dead bodies, gas, network sync | Add raid state, extraction controller, timer, AI, weight, and extraction outcome handling |
| `server/src/game/gameProcessManager.ts` | One child process per active game | Keep process isolation; pass a raid-aware match configuration when creating the match |
| `shared/` | Definitions, serialization, binary messages, math, collision helpers | Add raid item definitions, extraction messages, and stash-related API schemas |
| `server/src/api/` | Hono API, session middleware, Drizzle access, rate limits | Add credentials auth, stash, vendor, and raid-finalization routes |
| Map/atlas pipeline | Map definitions and Survev assets | Reuse for the MVP and add data-driven extraction and loot-container markers |

### 4.2 New Logical Modules

| Module | Responsibility |
| --- | --- |
| `raidManager` | Owns a player's in-match lifecycle: deployed, alive, extracting, extracted, dead, timed-out |
| `extractionManager` | Chooses valid exits, validates proximity, controls the 10-second channel, interrupts on damage, and exposes intel |
| `intelManager` | Places/awards extraction-intel items and records revealed exits per player |
| `weightManager` | Calculates carried weight and applies the resulting movement multiplier server-side |
| `aiManager` | Runs guard patrol/combat behavior and simple match-fill bot behavior |
| `stashService` | Performs transactional stash reads, loadout reservation, extraction deposit, and death/timeout loss finalization |
| `vendorService` | Validates fixed-price buy/sell operations and records currency changes |

These modules must stay server-side except for presentation. The browser sends intent; the game process or API verifies and applies state.

## 5. Match and Raid Lifecycle

```text
Stash loadout selected
  → API reserves selected stash items
  → Matchmaker creates/joins a 12-slot solo match
  → Game process receives a signed raid-loadout snapshot
  → Player spawns at a random map position
  → Loot / fight / acquire extraction intel
  → Start extraction channel
      ├─ damaged, moved away, or cancelled → return to alive
      └─ channel completes → extracted; game connection closes
  → death or 12-minute timeout → raid loadout and carried loot are lost
  → extraction → API atomically deposits carried loot into the stash
```

### Match Rules

- Match capacity is explicitly set to 12, rather than inheriting the current map's 80-player configuration.
- The match begins promptly. Vacant slots are filled by simple bots after a short queue threshold so public queueing remains immediate.
- The existing shrinking gas remains, but the match is not won by being the final survivor.
- At 12 minutes, every non-extracted player is marked `timed_out`; their raid inventory is lost and the match closes.
- Once extracted, a player cannot re-enter that match.

### Extraction Rules

- Each map configuration defines several candidate fixed exits.
- The server selects available exits for the match; the client does not know them at match start.
- An intel pickup reveals the selected exits only to its collector.
- The server begins the channel only when the player is inside a valid exit area, alive, and not already extracting.
- Damage, leaving the area, death, or explicit cancellation interrupts the channel.
- On completion, the game process sends the final carried inventory to the API through its trusted private route. The API commits the stash transfer before confirming the raid result.

## 6. Gameplay Design Choices

### Combat and Loot

- Retain Survev's top-down real-time shooting, projectile, reload, grenade, collision, and ground-loot systems.
- MVP weapon set: knife, pistol, shotgun, rifle, SMG, sniper rifle, lootable scopes, and Survev-style throwables.
- Reuse Survev's scope and throwable definitions/behavior for the MVP, including their pickup, inventory, aiming, trajectory, explosion, and effect handling.
- Defeated players and guards drop all carried items onto the ground.
- Keep the existing helmet and vest equipment model, but define three tiers and durable condition for each.
- Keep bandages, medkits, painkillers, and boost items.

### Container-Specific Spawning

Each map container type has a named loot category and a weighted item table. For example:

| Container type | Category | Typical contents |
| --- | --- | --- |
| Medical crate | `medical` | Bandages, medkits, painkillers |
| Ammunition crate | `ammo` | Ammo and grenades |
| Weapon case | `weapons` | Weapons and corresponding ammo |
| Military chest | `high_value` | Higher-tier armor, weapons, valuables |
| Civilian container | `civilian` | Low-tier healing, valuables, basic supplies |

Spawn selection is server-side and deterministic from the match seed. Client definitions are display-only.

### Weight System

- Replace the current backpack-capacity rule with a weight budget.
- Every item definition has `weight`; stackable item weight is `weight * quantity`.
- Armor and equipped weapons count toward carried weight.
- Total weight is authoritative on the server and replicated to the client.
- Movement speed falls linearly between `softWeightLimit` and `hardWeightLimit`; pickup fails above the hard limit.
- Backpacks remain lootable equipment and increase weight limits, rather than adding discrete slots.

### AI

Two deliberately separate AI types avoid conflating difficulty and population management:

| Type | Purpose | MVP behavior |
| --- | --- | --- |
| Guard | Protect high-value areas and patrol routes | Waypoint patrol, visual/range aggro, simple seek/attack/return state machine |
| Queue-fill bot | Fill vacant player slots | Spawn, loot nearby items, move toward safe zone, seek visible enemies, attempt extraction late in match |

AI uses the same `Player` combat, damage, inventory, and death-drop paths as a human player. It must never be trusted as a client or receive special loot rules.

## 7. Data Model

### Principles

- PostgreSQL is the source of truth for long-lived account, stash, and economy state.
- The game process is the source of truth only while a raid is active.
- Item definitions remain versioned TypeScript data, not editable database rows.
- Stash mutations are transactional and idempotent so reconnects or retried game-process requests cannot duplicate items.
- No password is stored; only a strong password hash is persisted.

### Existing Tables to Retain

| Table | MVP use |
| --- | --- |
| `users` | Account identity, player name, and basic profile |
| `session` | Hashed session token with expiry |
| `match_data` | Match-result history; extend with raid outcome fields |
| `banned_ips` / `ip_logs` | Moderation and abuse investigation |

Existing cosmetic `items`, pass, and quest tables are not part of the extraction economy. Disable their UI/routes for the MVP unless a retained dependency requires them.

### New and Changed Tables

#### `users` (extend)

| Column | Type | Notes |
| --- | --- | --- |
| `email` | `citext`, unique, nullable until registration completes | Normalized login identifier |
| `password_hash` | `text`, nullable | Argon2id password hash; never return it |
| `currency` | `bigint`, default `0` | Vendor currency balance |
| `email_verified_at` | timestamp, nullable | Reserved for verification; MVP may require it before play |

#### `stash_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID, primary key | Stable instance identifier |
| `user_id` | text, FK `users.id` | Owner |
| `definition_id` | text | References a versioned shared item definition |
| `quantity` | integer | Stack size; equipment rows use `1` |
| `durability` | integer, nullable | Armor condition; null for items that do not use it |
| `state` | enum | `available` or `reserved` |
| `reserved_raid_id` | UUID, nullable | Prevents an item from being used in two raids |
| `created_at`, `updated_at` | timestamps | Audit timestamps |

#### `raids`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID, primary key | Raid identifier shared by API and game process |
| `user_id` | text, FK `users.id` | Raid owner |
| `game_id` | UUID/string, nullable | Survev game-process match identifier after allocation |
| `map_id` | text | MVP map key |
| `state` | enum | `reserved`, `queued`, `active`, `extracting`, `extracted`, `died`, `timed_out`, `cancelled` |
| `loadout_snapshot` | JSONB | Immutable item/type/quantity/durability snapshot sent to the match |
| `carried_snapshot` | JSONB, nullable | Final authoritative inventory reported by the game process |
| `started_at`, `ended_at` | timestamps | Lifecycle and reconciliation |
| `terminal_reason` | text, nullable | Debuggable outcome reason |

#### `vendor_prices`

| Column | Type | Notes |
| --- | --- | --- |
| `definition_id` | text, primary key | Shared item definition key |
| `buy_price` | bigint | Fixed purchase price |
| `sell_price` | bigint | Fixed sale price |
| `enabled` | boolean | Allows the MVP catalog to be controlled without code changes |

#### `economy_ledger`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID, primary key | Transaction ID |
| `user_id` | text, FK `users.id` | Affected account |
| `kind` | enum | `vendor_buy`, `vendor_sell`, `raid_extract`, `raid_loss`, `admin_adjustment` |
| `currency_delta` | bigint | Positive or negative balance change |
| `raid_id` | UUID, nullable | Links extraction/loss results |
| `idempotency_key` | text, unique | Rejects duplicate finalization requests |
| `details` | JSONB | Item and price snapshot |
| `created_at` | timestamp | Audit timestamp |

### Data Integrity Rules

1. Creating a raid reserves its selected `stash_items` in one database transaction.
2. A reserved item cannot be sold, equipped in another raid, or otherwise changed.
3. Extraction finalization locks the raid row, verifies `state = active` or `extracting`, deposits `carried_snapshot`, consumes deployed items, creates a ledger row, then marks the raid `extracted`.
4. Death and timeout finalization lock the raid row, consumes reserved/deployed items, creates a zero-currency loss ledger row, then marks the raid terminal.
5. Repeated finalization calls return the already-recorded terminal result and never mutate the stash twice.

## 8. API and Real-Time Protocol

### HTTP API

| Endpoint group | Responsibilities |
| --- | --- |
| `POST /api/auth/register` | Create account with email and Argon2id password hash |
| `POST /api/auth/login` | Verify credentials and issue secure session cookie |
| `POST /api/auth/logout` | Revoke current session |
| `GET /api/stash` | Return available stash items and currency |
| `POST /api/stash/loadout` | Validate selected items and reserve them for a new raid |
| `POST /api/match/find` | Allocate or join a solo match using the reserved raid |
| `GET /api/vendor/catalog` | Return enabled fixed prices |
| `POST /api/vendor/buy` | Deduct currency and add stash items transactionally |
| `POST /api/vendor/sell` | Remove available stash items and credit currency transactionally |
| Internal `POST /private/raids/finalize` | Trusted game-process request to commit extraction, death, or timeout |

Every externally supplied body is Zod-validated. All mutation endpoints require the authenticated session and an idempotency key.

### New Binary Gameplay Messages

| Direction | Message | Payload |
| --- | --- | --- |
| Server → client | `RaidState` | Raid state, match time remaining, extracted/dead flag |
| Server → client | `ExtractionIntel` | Revealed extraction IDs and coordinates |
| Client → server | `StartExtraction` | Requested extraction ID |
| Client → server | `CancelExtraction` | Explicit cancellation |
| Server → client | `ExtractionProgress` | Extraction ID, elapsed/remaining time, interrupt reason |
| Server → client | `WeightUpdate` | Current weight, soft/hard limit, movement multiplier |

The server validates all state transitions. The client only renders them and sends player intent.

## 9. Deployment Method

### MVP Topology

Deploy one regional Ubuntu LTS VPS. This keeps latency low and operating complexity small for a 12-player, single-map MVP.

| Service | Runtime | Network exposure |
| --- | --- | --- |
| Nginx | system service | Public TCP 80/443 only |
| Client assets | Nginx-served Vite `dist/` files | Public through HTTPS |
| API | systemd `extraction-api` service | Loopback only, port 8000 |
| Match allocator/game server | systemd `extraction-game` service | Game endpoint exposed through TLS/WebSocket configuration |
| Per-match child processes | Spawned by game server | Internal game-port range only; never public directly unless the client protocol requires it |
| PostgreSQL | system service | Loopback only |
| Redis | system service | Loopback only |

Use Nginx to serve the static client and proxy `/api` plus API WebSocket routes. Preserve the fork's game-server TLS/proxy settings for the game socket and child-match port range; test the exact routing configuration before public playtests.

### Deployment Steps

1. Provision Ubuntu LTS with a domain name and firewall allowing only SSH, HTTP, and HTTPS.
2. Install Node.js 22+, pnpm, PostgreSQL, Redis, Nginx, and the required native build toolchain for `uWebSockets.js`.
3. Create a dedicated non-root service user and a PostgreSQL database/user.
4. Set production secrets in a root-readable environment file: database URL, session/API secrets, password-hash configuration, trusted proxy/IP settings, and game-region address.
5. Run `pnpm install --frozen-lockfile`, database migrations, then `pnpm build`.
6. Deploy versioned build artifacts, run migrations once, and restart the two systemd services.
7. Nginx serves `client/dist`, proxies the API, upgrades WebSockets, and terminates TLS.
8. Run a scripted 12-player/bot stress test and verify a successful extraction updates the stash exactly once before each release.

### Operational Rules

- PostgreSQL is backed up daily and before every migration.
- API and game-server logs go to journald with rotation; fatal game-process failures are visible and restart the parent service.
- Production uses secure, `HttpOnly`, `SameSite=Lax`, HTTPS-only session cookies.
- Rate limits remain enabled for authentication, matchmaking, and WebSocket ingress.
- Game-server private finalization calls authenticate with a separate service secret; they are not public API endpoints.
- Horizontal multi-region deployment, container orchestration, and a separate matchmaking service are intentionally out of scope until the MVP has proven load and retention.

## 10. Implementation Order

1. Remove or disable non-MVP modes and set map capacity to 12.
2. Add email/password authentication and the migration for account extensions.
3. Add stash, vendor, ledger, and transactional loadout reservation.
4. Add raid state and terminal outcome handling to the game process and private API.
5. Add extraction zones, intel, protocol messages, and client UI.
6. Replace capacity inventory with weight and implement three-tier durable armor.
7. Add guards, then queue-fill bots, both through the common player combat paths.
8. Deploy the single-VPS stack and validate end-to-end extraction/death/timeout reconciliation under load.

## 11. Acceptance Criteria

- A registered user can buy items, see their stash, reserve a loadout, and enter a 12-slot solo match.
- The game server authoritatively handles combat, loot, weight, guards, bots, the gas zone, and extraction.
- Extraction intel reveals exits only to its collector.
- A 10-second extraction is interrupted by damage, movement out of range, death, or cancellation.
- Successful extraction atomically adds the final inventory to the stash exactly once.
- Death and timeout permanently consume the raid's deployed/carried gear and never alter protected stash items.
- The MVP runs from one repeatable Ubuntu deployment with TLS, PostgreSQL, Redis, Nginx, and supervised API/game processes.
