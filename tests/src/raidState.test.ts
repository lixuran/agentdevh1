import { expect, test, vi } from "vitest";
import type { Player } from "../../server/src/game/objects/player.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import { isTerminalRaidState } from "../../shared/defs/raidState.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import { MsgType } from "../../shared/net/net.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

function createMvpGame() {
    // Keep the deterministic compact test map while exercising the MVP map/mode rule.
    const game = createGame(MvpRules.teamMode, "test_normal");
    game.mapName = MvpRules.mapName;
    game.started = true;
    return game;
}

function killPlayer(target: Player, source?: Player) {
    target.damage({
        amount: 999,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source,
    });
}

test("terminal raid states are limited to extracted, died, and timed out", () => {
    expect(isTerminalRaidState("active")).toBe(false);
    expect(isTerminalRaidState("extracting")).toBe(false);
    expect(isTerminalRaidState("extracted")).toBe(true);
    expect(isTerminalRaidState("died")).toBe(true);
    expect(isTerminalRaidState("timed_out")).toBe(true);
});

test("the last active MVP human does not win or receive a GameOver packet", () => {
    const game = createMvpGame();
    const survivor = game.playerBarn.addTestPlayer({});
    const eliminated = game.playerBarn.addTestPlayer({});

    killPlayer(eliminated, survivor);
    game.step(0.1);

    expect(eliminated.raidState).toBe("died");
    expect(survivor.raidState).toBe("active");
    expect(game.over).toBe(false);
    expect(game.winningTeamId).toBe(0);
    expect(game.playerBarn.sentWinEmotes).toBe(false);
    expect(survivor.sentGameOverMsg).toBe(false);
    expect(eliminated.sentGameOverMsg).toBe(false);
    expect(survivor.client.msgsToSend).not.toContainEqual(expect.objectContaining({ type: MsgType.GameOver }));
    expect(eliminated.client.msgsToSend).not.toContainEqual(expect.objectContaining({ type: MsgType.GameOver }));
});

test("a death transition is idempotent and preserves existing kill side effects", () => {
    const game = createMvpGame();
    const killer = game.playerBarn.addTestPlayer({});
    const target = game.playerBarn.addTestPlayer({});
    target.invManager.give("9mm", 1);
    const transition = vi.spyOn(game, "transitionPlayerRaidState");

    killPlayer(target, killer);
    const dropsAfterFirstDeath = game.lootBarn.loots.length;
    killPlayer(target, killer);
    game.step(0.1);

    expect(target.raidState).toBe("died");
    expect(killer.kills).toBe(1);
    expect(game.lootBarn.loots).toHaveLength(dropsAfterFirstDeath);
    expect(transition).toHaveBeenCalledTimes(1);
});

test("a terminal transition is rejected without a second completion check", () => {
    const game = createMvpGame();
    const terminalHuman = game.playerBarn.addTestPlayer({});
    game.playerBarn.addTestPlayer({});

    expect(game.transitionPlayerRaidState(terminalHuman, "extracted")).toBe(true);
    const checkGameOver = vi.spyOn(game, "checkGameOver");

    expect(game.transitionPlayerRaidState(terminalHuman, "timed_out")).toBe(false);
    expect(terminalHuman.raidState).toBe("extracted");
    expect(checkGameOver).not.toHaveBeenCalled();
    expect(game.over).toBe(false);
});

test("all terminal human participants end an MVP match despite active nonhumans", () => {
    const game = createMvpGame();
    const extracted = game.playerBarn.addTestPlayer({});
    const dying = game.playerBarn.addTestPlayer({});
    const activeBot = game.playerBarn.addTestPlayer({ isHumanParticipant: false });

    expect(game.transitionPlayerRaidState(extracted, "extracted")).toBe(true);
    killPlayer(dying, extracted);
    game.step(0.1);

    expect(activeBot.isHumanParticipant).toBe(false);
    expect(activeBot.raidState).toBe("active");
    expect(game.over).toBe(true);
    expect(game.winningTeamId).toBe(0);
    expect(game.playerBarn.sentWinEmotes).toBe(false);
});

test("an active human prevents MVP completion even when nonhumans are terminal", () => {
    const game = createMvpGame();
    const activeHuman = game.playerBarn.addTestPlayer({});
    const terminalHuman = game.playerBarn.addTestPlayer({});
    const terminalBot = game.playerBarn.addTestPlayer({ isHumanParticipant: false });

    game.transitionPlayerRaidState(terminalHuman, "timed_out");
    game.transitionPlayerRaidState(terminalBot, "died");
    game.step(0.1);

    expect(activeHuman.raidState).toBe("active");
    expect(game.over).toBe(false);
});

test("an MVP process with no human participants does not complete by vacuous truth", () => {
    const game = createMvpGame();
    game.playerBarn.addTestPlayer({ isHumanParticipant: false });

    game.checkGameOver();
    game.step(0.1);

    expect(game.over).toBe(false);
});
