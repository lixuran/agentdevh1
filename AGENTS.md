# Agent Guide

## Project

This repository forks Survev to build a desktop-browser, top-down, solo extraction game. The MVP loop is: equip a stash loadout, deploy, loot and fight, discover extraction intel, extract, and retain loot only after a successful extraction.

Survev remains the technical foundation: TypeScript, PixiJS rendering, binary WebSocket gameplay, server-authoritative match processes, Hono API routes, PostgreSQL/Drizzle persistence, Redis, and Vite. Adapt the foundation; do not replace it with a new game engine or microservice architecture.

## Documents
Read [`_docs/process.md`](_docs/process.md) at the start of each session and
after context compaction. It defines the issue, worktree, QA, and integration
workflow.

Read these documents before changing product behavior or architecture:

- [`_doc/plan.md`](_doc/plan.md): locked MVP gameplay scope.
- [`_doc/architecture.md`](_doc/architecture.md): module boundaries, data model, protocol, and deployment design.
- GitHub Issues: the canonical implementation backlog.

## MVP Constraints

- Desktop browser and keyboard/mouse only.
- Public solo queue only; 12 slots; 12-minute hard limit.
- The full Survev map and Survev visual/combat assets are used for the MVP.
- Extraction, persistent stash, fixed-price vendor, email/password accounts, guards, and queue-fill bots are in scope.
- Lootable scopes and Survev-style throwables are in scope; other weapon attachments are not.
- Do not add squads, multiple maps, crafting, insurance, safe containers, quests, marketplace, mobile support, ranked mode, cosmetics, or voice chat.

## Repository Layout

| Path | Responsibility |
| --- | --- |
| `client/` | Vite/PixiJS browser client, UI, input, rendering, and assets |
| `server/src/game/` | Authoritative simulation, match processes, game objects, combat, and networking |
| `server/src/api/` | Hono API, authentication, persistence, and private server routes |
| `shared/` | Shared definitions, binary messages, schemas, math, and collision utilities |
| `tests/` | Vitest test suite |
| `_doc/` | Product plan and architecture decisions |

## Local Development Commands

Run commands from the repository root unless a command says otherwise.

### Setup

```powershell
pnpm install --frozen-lockfile
pnpm survev-setup
```

`pnpm survev-setup` is interactive and creates `survev-config.hjson`. It contains local configuration and generated secrets; it is ignored by Git and must never be committed.

### Run Locally

```powershell
pnpm dev
pnpm dev:client
pnpm dev:api
pnpm dev:game
```

`pnpm dev` starts client, API, and game server together. The default API and game-server ports are `8000` and `8001`; per-match child processes start at `9000`.

### Validation

```powershell
pnpm --dir tests test --run
pnpm --dir server typecheck
pnpm --dir client typecheck
pnpm lint:ci
pnpm build
pnpm stressTest
```

Use the narrowest relevant validation while developing, then run all applicable commands before handing off a change:

- Shared protocol, game simulation, or server changes: server typecheck and relevant Vitest tests.
- Client changes: client typecheck and relevant Vitest tests.
- API/schema changes: server typecheck, relevant Vitest tests, and a migration review.
- Cross-layer changes: tests, both typechecks, `pnpm lint:ci`, and `pnpm build`.

`pnpm lint` auto-fixes files. Use it only when the requested work includes formatting changes; use `pnpm lint:ci` for verification.

### Database Commands

```powershell
pnpm --dir server db:generate
pnpm --dir server db:migrate
pnpm --dir server db:seed
pnpm --dir server db:studio
```

`db:wipe` destroys local database data. Never run it unless the user explicitly requests a local database reset. Never apply migrations to a shared or production database without explicit user approval.

## Deployment

The target MVP deployment is one Ubuntu LTS VPS with Nginx, systemd, PostgreSQL, and Redis. Nginx serves `client/dist`, proxies the API, terminates TLS, and supports WebSocket upgrade routes. The API and game-server parent process run as separate systemd services; match processes are created by the game server.

Expected production sequence:

```sh
pnpm install --frozen-lockfile
pnpm --dir server db:migrate
pnpm build
sudo systemctl restart extraction-api
sudo systemctl restart extraction-game
sudo systemctl status extraction-api extraction-game
```

Before a production deployment, ensure that:

1. PostgreSQL has a verified backup.
2. Required secrets are supplied through a root-readable environment file, never tracked files.
3. The database migration has been reviewed and approved.
4. Nginx and systemd configuration has been validated on the target host.
5. A successful extraction, death, and timeout each reconcile stash state exactly once in a staging environment.

Do not deploy, alter a remote database, change production secrets, or restart remote services without explicit user authorization.

## Engineering Rules

### Authoritative State

- The game server is authoritative for movement, combat, loot, weight, AI, extraction eligibility, and terminal raid outcomes.
- The browser may send intent and render replicated state; it must not decide outcomes or persist inventory.
- PostgreSQL is authoritative for accounts, stash, currency, vendor transactions, raids, and the economy ledger.
- Use an idempotency key and a database transaction for every stash, vendor, and raid-finalization mutation.

### Protocol and Shared Code

- Any client/server gameplay message must be added to `shared/` first, then implemented on both sides in the same change.
- Keep binary message changes backward-compatible within a deployment or deploy client/server together.
- Put gameplay item and map data in shared typed definitions. Do not duplicate item IDs, constants, or balancing values in client and server code.

### Persistence and Security

- Store password hashes only; use Argon2id for password verification.
- Never log passwords, session tokens, API keys, database URLs, or private finalization secrets.
- Do not trust client-provided item IDs, quantities, loadout state, extraction state, or terminal results without server-side validation.
- Reserve stash items before a raid. Extraction, death, and timeout must use one idempotent finalization boundary.

### Scope and Simplicity

- Prefer small, data-driven extensions to existing Survev systems over parallel systems or rewrites.
- Keep guards and queue-fill bots separate, but route both through shared player combat, inventory, and death-drop behavior.
- Disable or remove inherited battle-royale-only features in MVP mode instead of extending them: teams, revives, spectators, battle pass, quests, perks, roles, cosmetics, public leaderboards, and seasonal/event modes.
- Do not add dependencies, services, or abstractions unless they are required by an accepted MVP issue.

### Change Hygiene

- Read the relevant implementation and existing tests before editing.
- Keep changes focused on one GitHub issue. Do not mix refactors, formatting sweeps, and feature work.
- Add or update tests for changed behavior, especially economy, inventory, network protocol, and game-state transitions.
- Preserve existing code-comment language and surrounding style.
- Run validation before claiming a task is complete; report the commands run and their results.
- Do not use `git reset --hard`, force-push, or destructive database commands.
- Preserve `survev-upstream` as the read-only upstream remote. Push project work only to `origin`.

### Workflow Git Authority

For work launched through `_docs/process.md`, the orchestrator has standing
authority to create focused commits, push assigned issue branches, rebase them
as the process directs, merge QA-passed branches into `master`, push `master`,
and close the corresponding GitHub issue. It must first run the required
review and validation, follow the documented merge queue, and report every
result. This authority never permits force-pushes, `git reset --hard`,
rewriting published history, or pushes outside the assigned project workflow.

## Git and GitHub

- The public project repository is `https://github.com/lixuran/agentdevh1`.
- Use GitHub Issues as the backlog; link implementation changes to the issue they address.
- Do not commit generated output, `node_modules/`, `dist/`, local database files, `survev-config.hjson`, environment files, or `.ua/` analysis artifacts.
- For a GitHub issue session launched under `_docs/process.md`, commit and push
  only the assigned issue branch as that process directs. Never merge, push
  `master`, or force-push unless the user explicitly asks for it.
