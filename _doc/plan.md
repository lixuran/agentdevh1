# MVP Plan: Solo Top-Down Extraction Game

## Goal

Build a desktop-browser, top-down, real-time solo extraction game. The core loop is:

1. Equip from the persistent stash.
2. Deploy into a match.
3. Search containers, fight players and guards, and gather loot.
4. Find extraction intel and reach an extraction point.
5. Extract, then store or sell loot before the next raid.

## Prototype Asset Source

For the MVP, reuse Survev visual assets, including its map, guns, and related art.
For the ingame fighting, health item, bullet rendering , reuse survev design when applicable.
## Match Structure

| Area | MVP decision |
| --- | --- |
| Mode | Solo only |
| Match size | 12 player slots |
| Match length | 12-minute hard timer |
| End condition | At time expiry, unextracted players lose carried loot |
| Map | Full Survev map |
| Player spawning | Random positions across the map |
| Matchmaking | Public instant queue; bots fill vacant player slots |
| Zone | A slowly shrinking danger zone pushes players together |
| Re-entry | Extraction ends that player's match; no redeploy |

## Extraction

- The map has several possible fixed extraction locations.
- Extractions are not initially visible in the UI.
- Players find intel items to reveal available extraction locations.
- Extraction requires a 10-second channel.
- Taking damage interrupts the extraction channel.

## Combat and AI

- Combat is Survev-like: top-down, real-time aiming, shooting, projectiles, and reloading.
- A player with no loadout enters with bare hands and a knife.
- MVP weapons: pistol, shotgun, rifle, SMG, sniper rifle, scopes, and Survev-style throwables.
- Scopes are supported as lootable optics. Other weapon attachments are out of scope.
- AI guards patrol the map and also defend high-value loot locations.
- Match-filling bots are separate from AI guards and use simple combat behavior.

## Loot, Inventory, and Survival

- Containers have item categories and drop probabilities based on container type.
- Players can loot all items carried by defeated players and guards; those items drop onto the ground.
- Inventory is weight-based rather than slot-based.
- Higher carried weight slows movement.
- Armor has separate helmet and vest slots, each with three tiers and durability.
- Healing items: bandages, medkits, painkillers, and boost items.
- There is no safe container: all carried items are at risk.

## Persistence and Economy

- A successful extraction permanently transfers carried loot to the player's stash.
- Death loses all equipped and carried raid gear; the persistent stash remains safe.
- Players select raid gear from the stash before deployment.
- The MVP includes a fixed-price vendor for buying and selling.
- Accounts use email and password so progression and stashes persist.

## Explicitly Out of Scope

- Squads and team modes
- Multiple maps
- Weapon attachments other than scopes
- Crafting, durability for weapons, insurance, and a safe container
- Quests, daily objectives, narrative, skills, and prestige systems
- Player marketplace
- Mobile support
- Cosmetics, ranked mode, and voice chat

## MVP Completion Criteria

- A player can register, log in, manage a persistent stash, and buy or sell through the vendor.
- A player can equip a loadout, join an instant solo match, and spawn on the map.
- The match supports 12 slots with bots filling empty slots, loot containers, guards, combat, death drops, a shrinking zone, and a 12-minute timeout.
- A player can discover extraction intel, channel an extraction, and retain loot only after successful extraction.
