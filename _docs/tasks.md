# MVP Implementation Backlog

## 1. Establish an empty project baseline with a passing test
Goal: Create a clean extraction-game project baseline and prove the test runner works.
Description: Configure the fork's package scripts so a minimal smoke test runs successfully without requiring a database, game server, or browser. Record the exact local commands for install, typecheck, lint, and test in the repository README or developer notes.

## 2. Add a shared MVP configuration module
Goal: Define one typed source of truth for the MVP's solo-match rules.
Description: Create a shared configuration module containing the 12-player capacity, 12-minute limit, solo-only mode, extraction channel duration, and enabled map key. Add unit tests that verify the configuration values and prevent accidental activation of squad modes.

## 3. Restrict matchmaking to the solo MVP mode
Goal: Ensure the match allocator exposes only the 12-player solo extraction queue.
Description: Update the server's mode registration and matchmaking validation to accept the configured solo mode only. Return a clear validation error for team, private, or unsupported mode requests, and cover the accepted and rejected requests with API tests.

## 4. Set the selected map's match capacity to 12
Goal: Make the MVP map admit no more than 12 player slots.
Description: Add an extraction-specific map mode or override that uses the selected Survev map while setting its maximum player count to 12. Test that the game-process allocator reports no available slots after the twelfth reservation.

## 5. Replace battle-royale victory with raid terminal states
Goal: Stop the match from declaring the final survivor the winner.
Description: Introduce typed raid outcomes for extracted, died, and timed-out players, while preserving existing combat and death mechanics. Update the game-over condition so a match closes only when the hard timer has expired or every human player has reached a terminal raid state.

## 6. Add a server-authoritative 12-minute match timer
Goal: End every MVP match at exactly the configured hard limit.
Description: Track elapsed raid time in the authoritative game process and replicate the remaining time to connected clients. At expiry, mark every non-extracted human player as timed out and invoke the common terminal-outcome path.

## 7. Remove squad-only gameplay from the MVP mode
Goal: Ensure an MVP player cannot form, join, revive, or depend on a team.
Description: Disable group formation, team autofill, downed/revive behavior, and team-only gameplay branches when the extraction mode is active. Add focused tests covering solo spawn, death, and reconnect behavior without a group.

## 8. Disable battle-pass and quest surfaces
Goal: Exclude pass, XP, quest, and reward loops from the MVP client and API.
Description: Remove the MVP mode's routes, account requests, menu entries, and game-process quest reporting for passes and quests. Preserve unrelated account/session infrastructure and verify that the client can open the main menu without pass data.

## 9. Disable cosmetic loadout and emote surfaces
Goal: Exclude outfits, cosmetic unlocks, emotes, and crosshair customization from the MVP.
Description: Hide or remove their client menu entries and prevent cosmetic loadout data from affecting an extraction raid. Keep only the combat loadout selected from the persistent stash.

## 10. Disable spectator and public-stat screens
Goal: Keep death and extraction terminal for the MVP player experience.
Description: Disable spectating after death and remove routes/UI for leaderboards, player profiles, and public match history. Retain internal raid records solely for reconciliation, operational support, and debugging.

## 11. Add email/password fields to the account schema
Goal: Extend accounts for credential-based MVP login without storing plaintext passwords.
Description: Create a Drizzle migration adding a normalized unique email, nullable password hash, and currency balance to the user record. Add schema-level tests for uniqueness and ensure password-hash fields never appear in public profile responses.

## 12. Implement email/password registration
Goal: Allow a new player to create an account securely.
Description: Add a validated registration endpoint that normalizes email, hashes the password with Argon2id, creates the user, and issues the existing secure session cookie. Add tests for successful registration, duplicate email rejection, and invalid credentials.

## 13. Implement email/password login and logout
Goal: Let registered users create and revoke browser sessions.
Description: Add login validation using the stored Argon2id hash and reuse the existing session-table lifecycle for cookie issuance and logout. Test invalid passwords, expired sessions, and session revocation.

## 14. Disable OAuth authentication for the MVP
Goal: Make email/password the only supported player authentication path.
Description: Remove OAuth provider buttons and routes from the MVP client/API configuration without deleting reusable session middleware. Verify unauthenticated users are directed to credential login and cannot enter matchmaking.

## 15. Create persistent stash database tables
Goal: Persist owned raid items independently from cosmetic inventory.
Description: Add the `stash_items` table with item definition ID, quantity, optional durability, availability state, raid reservation, and audit timestamps. Add migrations and tests for ownership isolation, valid quantities, and equipment rows with quantity one.

## 16. Implement the authenticated stash read API
Goal: Return a player's available stash items and currency safely.
Description: Add a read-only endpoint that returns only the authenticated user's non-reserved stash items plus their currency balance. Define and test the response schema so private internal fields and other users' items cannot leak.

## 17. Seed a minimal vendor catalog
Goal: Provide fixed buy and sell prices for MVP item definitions.
Description: Add the `vendor_prices` table and a migration/seed for the MVP weapons, ammunition, healing items, scopes, throwables, armor, backpacks, and valuables. Add a catalog endpoint that returns only enabled offers.

## 18. Implement vendor purchases
Goal: Let an authenticated player buy a priced item into their stash.
Description: Create a transactional purchase endpoint that validates the offer, checks currency, decrements the balance, creates or increments stash items, and writes an economy-ledger entry. Test insufficient funds, disabled offers, and idempotent retries.

## 19. Implement vendor sales
Goal: Let an authenticated player sell available stash items for fixed currency.
Description: Create a transactional sell endpoint that locks the selected available item, removes the requested quantity, credits the configured sale price, and writes an economy-ledger entry. Test reserved-item rejection, partial-stack sale, and retry safety.

## 20. Create raid and economy-ledger tables
Goal: Persist the state needed to reconcile every deployment and terminal result.
Description: Add `raids` and `economy_ledger` tables with typed lifecycle state, immutable loadout snapshot, terminal carried-inventory snapshot, and idempotency keys. Add migration tests for state constraints and unique finalization keys.

## 21. Reserve a stash loadout for a raid
Goal: Prevent a player from using or selling the same item in two raids.
Description: Add an authenticated endpoint that validates a selected combat loadout, creates a `reserved` raid, and marks the chosen stash rows reserved in one transaction. Test concurrent reservation attempts and rollback on validation failure.

## 22. Pass a signed raid snapshot into a match
Goal: Ensure the game process receives an immutable, server-issued raid loadout.
Description: Extend matchmaking join data with a raid ID and signed loadout snapshot created by the API after reservation. Validate the signature and raid state in the game process before spawning the player, with tests for tampered or expired data.

## 23. Configure the MVP weapon roster
Goal: Limit normal weapon spawns to knife, pistol, shotgun, rifle, SMG, and sniper rifle.
Description: Build an extraction-mode weapon allowlist using the existing Survev definitions and ensure disabled weapons cannot be spawned, equipped, or purchased. Add definition-level tests that the required weapons remain available.

## 24. Enable Survev-style scopes and throwables
Goal: Include lootable scopes and Survev-style throwable behavior in the MVP.
Description: Configure extraction-mode loot and inventory to accept Survev scope pickups and the selected throwable definitions, reusing their aim, trajectory, explosion, and effect systems. Keep all non-scope attachment types unavailable and cover the allowlist with tests.

## 25. Add three-tier durable helmet and vest definitions
Goal: Support three levels of helmet and body armor with persistent condition.
Description: Define the MVP helmet and vest tiers using Survev rendering and combat conventions, with damage reduction and durability metadata. Add unit tests for tier ordering, damage-reduction values, and valid durability ranges.

## 26. Add armor durability loss to combat
Goal: Reduce armor condition authoritatively when it absorbs damage.
Description: Update the server damage path to apply durability loss to the equipped helmet or vest before persisting the updated raid inventory. Test head/body damage, armor breakage, and unarmored damage without changing unrelated weapon calculations.

## 27. Define item weights and backpack limits
Goal: Make every MVP lootable item contribute to a weight-based inventory limit.
Description: Add weight metadata to the enabled item definitions and define soft/hard carrying limits for each backpack tier. Add tests for stackable-item weights, equipped-item weights, and valid backpack limit progression.

## 28. Enforce server-side carrying weight
Goal: Prevent a player from carrying items beyond the configured hard weight limit.
Description: Replace the extraction mode's discrete backpack-capacity check with a weight calculation during pickup, drop, death, and inventory changes. Reject pickups above the hard limit and test that the server remains authoritative over client inventory claims.

## 29. Apply weight-based movement penalties
Goal: Slow players carrying excess weight without changing normal movement at low weight.
Description: Calculate a movement multiplier between the soft and hard weight limits and apply it in the server player-movement path. Replicate the resulting weight and multiplier to clients and add boundary-value tests.

## 30. Add container-category loot definitions
Goal: Spawn items according to container type rather than a single generic table.
Description: Define named container categories such as medical, ammunition, weapon, high-value, and civilian, each with a weighted server-side item table. Add deterministic seeded tests proving a container only returns permitted items and honors configured probabilities.

## 31. Add extraction-location map definitions
Goal: Describe several possible fixed extraction zones on the MVP map.
Description: Add extraction IDs, positions, radii, and selection metadata to the extraction map configuration without exposing them automatically to the client. Validate that every extraction zone lies within map bounds and does not overlap an invalid collision area.

## 32. Select active extraction zones per match
Goal: Choose the extraction locations available for a specific match.
Description: Use the match seed to select active exits from the map's defined candidates and store the selection in authoritative match state. Add tests for determinism, valid selection count, and independent selections across different seeds.

## 33. Add extraction-intel loot and state
Goal: Let a player discover which exits are active.
Description: Create an intel pickup or interaction that records the active extraction IDs revealed to its collecting player. Add a server-to-client message for the player's private revealed-exit list and test that other players do not receive it.

## 34. Implement the server extraction channel
Goal: Extract an eligible player after an uninterrupted 10-second channel.
Description: Add start and cancel extraction intents, then validate range, alive state, active exit, and intel visibility on the server before starting the timer. Interrupt the channel on damage, leaving the area, death, or cancellation, and test every terminal path.

## 35. Add extraction progress and intel UI
Goal: Show revealed exits and extraction progress in the browser client.
Description: Render only exits present in the player's private extraction-intel state and add a clear 10-second progress indicator with interruption feedback. Keep the UI presentation-only; it must never determine eligibility or completion.

## 36. Implement private raid finalization
Goal: Atomically transfer extracted loot to the stash exactly once.
Description: Add a private game-process-to-API endpoint that locks the raid row, validates the signed terminal result, deposits the carried snapshot, consumes deployed gear, writes an economy ledger entry, and marks the raid extracted. Test duplicate requests, malformed snapshots, and database transaction rollback.

## 37. Finalize death and timeout losses
Goal: Permanently consume deployed and carried raid gear on death or match expiry.
Description: Route death and hard-timer outcomes through the same idempotent private finalization boundary used by extraction, but do not deposit carried inventory. Test that protected stash items remain unchanged and that repeated failure reports cannot consume items twice.

## 38. Add the raid status and weight HUD
Goal: Give a player the minimum information needed to make extraction decisions.
Description: Add client HUD elements for match time remaining, raid terminal state, current carried weight, soft/hard limits, and movement penalty. Populate them exclusively from replicated server state and add a client smoke test for rendering default values.

## 39. Implement guard patrol AI
Goal: Populate high-value areas and patrol routes with server-controlled guards.
Description: Add a small AI state machine with patrol, investigate, engage, and return states that uses existing collision and weapon systems. Keep pathfinding simple for the MVP and add deterministic unit tests for state transitions.

## 40. Make guards use normal combat and death-drop paths
Goal: Ensure guards are dangerous and lootable without special-case reward logic.
Description: Spawn guards through the shared player/combat abstractions so they take damage, use weapons, die, and drop carried equipment like human players. Add integration tests for killing a guard and picking up its dropped loot.

## 41. Implement queue-fill bot spawning
Goal: Fill vacant public-match slots after a short queue threshold.
Description: Add a match-start policy that creates server-controlled bot players only when fewer than 12 human reservations are available. Test that bots do not consume account stash items and that a full human lobby creates no bots.

## 42. Implement simple queue-fill bot behavior
Goal: Give match-fill bots enough behavior to loot, fight, avoid gas, and attempt extraction.
Description: Implement a deliberately simple behavior loop that chooses nearby loot, visible targets, safe-zone movement, and a late-match extraction goal. Reuse normal player movement, weapon, inventory, and death logic, with deterministic scenario tests for each behavior priority.

## 43. Add MVP deployment configuration
Goal: Make the application deployable to one Ubuntu VPS with Nginx and systemd.
Description: Add version-controlled Nginx and systemd templates for the Vite client, Hono API, and game-server parent process, using environment files for all secrets. Document required ports, game child-process range, TLS termination, and service health checks.

## 44. Add production database migration and backup runbook
Goal: Make schema deployment and recovery repeatable for the MVP.
Description: Document the ordered production migration procedure, daily PostgreSQL backup command, restore verification, and rollback policy. Include the raid/stash reconciliation checks that must be run before and after a release.

## 45. Add end-to-end raid reconciliation tests
Goal: Prove that a raid cannot duplicate or silently lose protected stash state.
Description: Write a test suite covering reserve loadout, successful extraction, death, timeout, duplicate finalization, and server-process retry. Each scenario must assert final stash contents, raid state, and economy-ledger entries.

## 46. Run a 12-slot match stress test
Goal: Validate the MVP's server process under its intended player and bot load.
Description: Adapt the existing stress-test entry point to create a 12-slot extraction match with a representative mix of bot and simulated player clients. Record tick time, network-sync time, memory, and terminal raid finalization results in a reproducible report.
