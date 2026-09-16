import { expect, test, vi } from "vitest";
import type { Client } from "../../server/src/game/client.ts";
import type { Game } from "../../server/src/game/game.ts";
import { NoOpSocket } from "../../server/src/game/socket.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import * as net from "../../shared/net/net.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

function createMvpTimerGame(): Game {
    // Keep the deterministic compact test map while exercising the MVP map/mode rule.
    const game = createGame(MvpRules.teamMode, "test_normal");
    game.mapName = MvpRules.mapName;
    vi.spyOn(game.modeManager, "isGameStarted").mockReturnValue(true);
    return game;
}

function startRaidTimer(game: Game) {
    game.update(0.1);

    expect(game.started).toBe(true);
    expect(game.raidTimerStarted).toBe(true);
    expect(game.raidTimerElapsedSeconds).toBe(0);
    expect(game.raidTimerRemainingSeconds).toBe(MvpRules.hardLimitSeconds);
}

function expectRaidTimerMessage(
    serializeMsg: ReturnType<typeof vi.spyOn>,
    remainingSeconds: number,
) {
    expect(serializeMsg).toHaveBeenCalledWith(
        net.MsgType.RaidTimer,
        expect.objectContaining({ remainingSeconds }),
    );
}

test("the MVP timer starts on the active transition without charging the pre-start tick", () => {
    const game = createMvpTimerGame();
    game.preventStart = true;

    game.update(10);
    expect(game.raidTimerStarted).toBe(false);
    expect(game.raidTimerElapsedSeconds).toBe(0);
    expect(game.raidTimerRemainingSeconds).toBe(0);

    game.preventStart = false;
    startRaidTimer(game);

    game.update(0.01);
    expect(game.raidTimerElapsedSeconds).toBeCloseTo(0.01);
    expect(game.raidTimerRemainingSeconds).toBe(MvpRules.hardLimitSeconds);
});

test("the authoritative timer rounds upward, clamps to its fixed range, and only advances with game dt", () => {
    const game = createMvpTimerGame();
    startRaidTimer(game);

    game.update(0.25);
    expect(game.raidTimerRemainingSeconds).toBe(720);

    game.update(0.76);
    expect(game.raidTimerElapsedSeconds).toBeCloseTo(1.01);
    expect(game.raidTimerRemainingSeconds).toBe(719);

    game.update(MvpRules.hardLimitSeconds);
    expect(game.raidTimerRemainingSeconds).toBe(0);

    game.update(1);
    expect(game.raidTimerRemainingSeconds).toBe(0);
});

test("RaidTimer is an append-only uint16 message that preserves stream framing", () => {
    expect(net.MsgType.RaidTimer).toBe(net.MsgType.PerkModeRoleSelect + 1);

    const stream = new net.MsgStream(new ArrayBuffer(16));
    const input = new net.RaidTimerMsg();
    input.remainingSeconds = MvpRules.hardLimitSeconds;
    const alive = new net.AliveCountsMsg();
    alive.teamAliveCounts = [3];
    stream.serializeMsg(net.MsgType.RaidTimer, input);
    stream.serializeMsg(net.MsgType.AliveCounts, alive);

    stream.stream.index = 0;
    expect(stream.deserializeMsgType()).toBe(net.MsgType.RaidTimer);
    const output = new net.RaidTimerMsg();
    output.deserialize(stream.getStream());
    expect(output.remainingSeconds).toBe(MvpRules.hardLimitSeconds);

    expect(stream.deserializeMsgType()).toBe(net.MsgType.AliveCounts);
    const outputAlive = new net.AliveCountsMsg();
    outputAlive.deserialize(stream.getStream());
    expect(outputAlive.teamAliveCounts).toEqual([3]);
});

test("each connected client receives the initial, changed, late-join, spectator, and final timer value once", () => {
    const game = createMvpTimerGame();
    const player = game.playerBarn.addTestPlayer({});
    const client = player.client as Client;
    const serializeMsg = vi.spyOn(client.msgStream, "serializeMsg");
    startRaidTimer(game);

    client.sendMsgs();
    expectRaidTimerMessage(serializeMsg, 720);

    serializeMsg.mockClear();
    client.sendMsgs();
    expect(serializeMsg).not.toHaveBeenCalledWith(net.MsgType.RaidTimer, expect.anything());

    game.update(1.01);
    serializeMsg.mockClear();
    client.sendMsgs();
    expectRaidTimerMessage(serializeMsg, 719);

    const latePlayer = game.playerBarn.addTestPlayer({});
    const lateClient = latePlayer.client as Client;
    const lateSerializeMsg = vi.spyOn(lateClient.msgStream, "serializeMsg");
    lateClient.sendMsgs();
    expectRaidTimerMessage(lateSerializeMsg, 719);

    const spectator = game.clientBarn.addSpectatorClient(new NoOpSocket(), {
        playerId: player.__id,
        specAnon: false,
        noSpecCooldown: true,
    });
    expect(spectator).toBeDefined();
    const spectatorSerializeMsg = vi.spyOn(spectator!.msgStream, "serializeMsg");
    spectator!.sendMsgs();
    expectRaidTimerMessage(spectatorSerializeMsg, 719);

    game.update(MvpRules.hardLimitSeconds);
    serializeMsg.mockClear();
    lateSerializeMsg.mockClear();
    spectatorSerializeMsg.mockClear();
    client.sendMsgs();
    lateClient.sendMsgs();
    spectator!.sendMsgs();
    expectRaidTimerMessage(serializeMsg, 0);
    expectRaidTimerMessage(lateSerializeMsg, 0);
    expectRaidTimerMessage(spectatorSerializeMsg, 0);
});

test("expiry latches before player updates and times out only active or extracting humans", () => {
    const game = createMvpTimerGame();
    const activeHuman = game.playerBarn.addTestPlayer({});
    const extractingHuman = game.playerBarn.addTestPlayer({});
    const extractedHuman = game.playerBarn.addTestPlayer({});
    const diedHuman = game.playerBarn.addTestPlayer({});
    const timedOutHuman = game.playerBarn.addTestPlayer({});
    const activeBot = game.playerBarn.addTestPlayer({ isHumanParticipant: false });
    extractingHuman.raidState = "extracting";
    extractedHuman.raidState = "extracted";
    diedHuman.raidState = "died";
    timedOutHuman.raidState = "timed_out";
    const transition = vi.spyOn(game, "transitionPlayerRaidState");
    startRaidTimer(game);

    game.update(MvpRules.hardLimitSeconds);

    expect(game.raidTimerExpired).toBe(true);
    expect(game.raidTimerRemainingSeconds).toBe(0);
    expect(activeHuman.raidState).toBe("timed_out");
    expect(extractingHuman.raidState).toBe("timed_out");
    expect(extractedHuman.raidState).toBe("extracted");
    expect(diedHuman.raidState).toBe("died");
    expect(timedOutHuman.raidState).toBe("timed_out");
    expect(activeBot.raidState).toBe("active");
    expect(transition).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenCalledWith(activeHuman, "timed_out");
    expect(transition).toHaveBeenCalledWith(extractingHuman, "timed_out");

    transition.mockClear();
    const checkGameOver = vi.spyOn(game, "checkGameOver");
    game.update(1);
    game.netSync();
    expect(transition).not.toHaveBeenCalled();
    expect(checkGameOver).not.toHaveBeenCalled();
});
