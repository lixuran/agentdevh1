import { expect, test, vi } from "vitest";
import { Game } from "../../server/src/game/game.ts";
import { GameProcess, GameProcessManager, ProcState } from "../../server/src/game/gameProcessManager.ts";
import { ProcessMsgType } from "../../server/src/game/ipcTypes.ts";
import type { FindGamePrivateBody } from "../../server/src/utils/types.ts";
import { MapDefs } from "../../shared/defs/mapDefs.ts";
import { getMatchMaxPlayers, MvpRules } from "../../shared/defs/mvpRules.ts";
import { TeamMode } from "../../shared/gameConfig.ts";

function playerData(count: number): FindGamePrivateBody["playerData"] {
    return Array.from({ length: count }, (_, index) => ({
        joinToken: `token-${index}`,
        userId: null,
        ip: "127.0.0.1",
    }));
}

function findGameBody(playerCount: number): FindGamePrivateBody {
    return {
        region: "na",
        version: 1,
        autoFill: true,
        mapName: MvpRules.mapName,
        teamMode: MvpRules.teamMode,
        playerData: playerData(playerCount),
    };
}

function createProcess(availableSlots = MvpRules.maxPlayers): {
    gameProcess: GameProcess;
    send: ReturnType<typeof vi.fn>;
} {
    const send = vi.fn();
    const gameProcess = Object.create(GameProcess.prototype) as GameProcess;
    Object.assign(gameProcess, {
        process: {
            killed: false,
            channel: {},
            send,
        },
        state: ProcState.Running,
        avaliableSlots: availableSlots,
        maxPlayers: MvpRules.maxPlayers,
        reservedJoinTokens: new Set<string>(),
        gameData: {
            id: "game",
            teamMode: MvpRules.teamMode,
            mapName: MvpRules.mapName,
            canJoin: true,
            aliveCount: 0,
            startedTime: 0,
            stopped: false,
            timeRunning: 0,
            livingPlayers: [],
        },
    });
    return { gameProcess, send };
}

function createManager(gameProcess: GameProcess): {
    manager: GameProcessManager;
    newGame: ReturnType<typeof vi.fn>;
} {
    const newGame = vi.fn();
    const manager = Object.create(GameProcessManager.prototype) as GameProcessManager;
    Object.assign(manager, {
        processes: [gameProcess],
        newGame,
    });
    return { manager, newGame };
}

test("the MVP process and child limit use the shared twelve-player rule", () => {
    const { gameProcess } = createProcess();
    const mainMapCapacity = MapDefs[MvpRules.mapName].gameMode.maxPlayers;
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, {
        mapName: MvpRules.mapName,
        teamMode: MvpRules.teamMode,
        map: { mapDef: { gameMode: { maxPlayers: mainMapCapacity } } },
        playerBarn: { livingPlayers: Array.from({ length: MvpRules.maxPlayers }) },
        over: false,
        startedTime: 0,
    });

    GameProcess.prototype.create.call(gameProcess, "game", {
        mapName: MvpRules.mapName,
        teamMode: MvpRules.teamMode,
    });

    expect(mainMapCapacity).toBe(80);
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers);
    expect(game.canJoin).toBe(false);
    expect(getMatchMaxPlayers(MvpRules.mapName, MvpRules.teamMode, mainMapCapacity)).toBe(MvpRules.maxPlayers);
    expect(getMatchMaxPlayers("desert", TeamMode.Duo, MapDefs.desert.gameMode.maxPlayers)).toBe(
        MapDefs.desert.gameMode.maxPlayers,
    );
});

test("a full matching process rejects the reservation without a new process or token", async () => {
    const { gameProcess, send } = createProcess();
    const { manager, newGame } = createManager(gameProcess);

    for (let index = 0; index < MvpRules.maxPlayers; index++) {
        await expect(manager.findGame(findGameBody(1))).resolves.toBe(gameProcess);
    }
    await expect(manager.findGame(findGameBody(1))).resolves.toBeUndefined();

    expect(newGame).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(MvpRules.maxPlayers);
});

test("an expired unconsumed token releases its reservation once for reuse", () => {
    const { gameProcess } = createProcess();
    const [expiredToken] = playerData(1);
    const [replacementToken] = playerData(1).map(token => ({ ...token, joinToken: "replacement" }));
    const [consumedToken] = playerData(1).map(token => ({ ...token, joinToken: "consumed" }));

    expect(gameProcess.reserveJoinTokens([expiredToken])).toBe(true);
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers - 1);

    const game = Object.create(Game.prototype) as Game;
    game.joinTokens = new Map([
        [
            expiredToken.joinToken,
            {
                type: "join",
                expiresAt: 0,
                data: {} as never,
            },
        ],
    ]);
    Object.defineProperty(game, "onJoinTokenExpired", {
        value: (token: string) => {
            (gameProcess as any)._onProcessMsg({
                type: ProcessMsgType.ReleaseJoinToken,
                token,
            });
        },
    });

    game.expireJoinTokens(1);
    game.expireJoinTokens(1);

    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers);
    expect(gameProcess.reserveJoinTokens([replacementToken])).toBe(true);
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers - 1);

    expect(gameProcess.reserveJoinTokens([consumedToken])).toBe(true);
    game.joinTokens.set(consumedToken.joinToken, {
        type: "join",
        expiresAt: 0,
        data: {} as never,
    });
    game.joinTokens.delete(consumedToken.joinToken);
    game.expireJoinTokens(1);
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers - 2);

    (gameProcess as any)._onProcessMsg({
        type: ProcessMsgType.ReleaseJoinToken,
        token: expiredToken.joinToken,
    });
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers - 2);

    gameProcess.avaliableSlots = MvpRules.maxPlayers;
    gameProcess.reservedJoinTokens.add("clamped");
    (gameProcess as any)._onProcessMsg({
        type: ProcessMsgType.ReleaseJoinToken,
        token: "clamped",
    });
    expect(gameProcess.avaliableSlots).toBe(MvpRules.maxPlayers);
});
