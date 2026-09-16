import { expect, test, vi } from "vitest";
import { Client } from "../../server/src/game/client.ts";
import type { JoinTokenData } from "../../server/src/game/game.ts";
import { NoOpSocket } from "../../server/src/game/socket.ts";
import { TeamMenu } from "../../server/src/teamMenu.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import { GameConfig } from "../../shared/gameConfig.ts";
import { InputMsg } from "../../shared/net/inputMsg.ts";
import { JoinMsg } from "../../shared/net/joinMsg.ts";
import { MsgType } from "../../shared/net/net.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

vi.mock("../../server/src/api/apiHelpers.ts", () => ({
    getFindGamePlayerData: async () => [],
    getHonoIp: () => undefined,
    verifyTurnsStile: async () => false,
}));

vi.mock("../../server/src/api/auth/index.ts", () => ({
    validateSessionToken: async () => ({ user: null }),
}));

vi.mock("../../server/src/api/routes/private/ModerationRouter.ts", () => ({
    hashIp: (ip: string) => ip,
    isBanned: async () => false,
}));

function createMvpGame() {
    // Keep the deterministic compact test map while exercising the MVP map/mode rule.
    const game = createGame(MvpRules.teamMode, "test_normal");
    game.mapName = MvpRules.mapName;
    game.started = true;
    return game;
}

function joinMvpGame(game: ReturnType<typeof createMvpGame>, groupData: JoinTokenData["groupData"]) {
    const joinMsg = new JoinMsg();
    joinMsg.name = "MVP Player";

    const client = game.clientBarn.addClientWithPlayer(
        new NoOpSocket<Client>(),
        {
            userId: null,
            findGameIp: "127.0.0.1",
            groupData,
        },
        joinMsg,
    );

    return client!.player!;
}

test("MVP join tokens ignore legacy group data and keep each player independent", () => {
    const game = createMvpGame();
    const adversarialGroupData = {
        autoFill: true,
        playerCount: 12,
        groupHashToJoin: "legacy-team-room-hash",
    };

    const firstPlayer = joinMvpGame(game, adversarialGroupData);
    const secondPlayer = joinMvpGame(game, { ...adversarialGroupData });

    expect(game.playerBarn.groups).toHaveLength(0);
    expect(firstPlayer.group).toBeUndefined();
    expect(firstPlayer.team).toBeUndefined();
    expect(firstPlayer.groupId).toBe(firstPlayer.teamId);
    expect(secondPlayer.group).toBeUndefined();
    expect(secondPlayer.team).toBeUndefined();
    expect(secondPlayer.groupId).toBe(secondPlayer.teamId);
    expect(secondPlayer.groupId).not.toBe(firstPlayer.groupId);
    expect(adversarialGroupData.groupHashToJoin).toBe("legacy-team-room-hash");
});

test("MVP team room connections and stale room messages close before room allocation", () => {
    const teamMenu = Object.assign(Object.create(TeamMenu.prototype), {
        server: {
            modes: [{
                mapName: MvpRules.mapName,
                teamMode: MvpRules.teamMode,
                enabled: true,
            }],
        },
        rooms: new Map(),
    }) as TeamMenu;
    const close = vi.fn();
    const socket = { close } as never;

    teamMenu.onOpen(socket, null, "127.0.0.1");
    teamMenu.onMsg(
        socket,
        JSON.stringify({
            type: "create",
            data: {
                roomData: {
                    roomUrl: "",
                    findingGame: false,
                    region: "na",
                    autoFill: true,
                    gameModeIdx: 0,
                },
                playerData: { name: "forged" },
            },
        }),
    );
    teamMenu.onMsg(socket, JSON.stringify({ type: "keepAlive" }));

    expect(close).toHaveBeenCalledTimes(3);
    expect(teamMenu.rooms.size).toBe(0);
});

test("MVP lethal self-revive damage reaches the ordinary terminal death seam", () => {
    const game = createMvpGame();
    const player = game.playerBarn.addTestPlayer({});
    const broadcast = vi.spyOn(game.clientBarn, "broadcastMsg");
    player.addPerk("self_revive");

    player.damage({
        amount: 999,
        damageType: GameConfig.DamageType.Airdrop,
        dir: v2.create(1, 0),
    });
    game.step(0.1);

    expect(player.downed).toBe(false);
    expect(player.dead).toBe(true);
    expect(player.raidState).toBe("died");
    expect(player.actionType).toBe(GameConfig.Action.None);
    expect(broadcast).not.toHaveBeenCalledWith(
        MsgType.Kill,
        expect.objectContaining({ downed: true }),
    );
});

test("MVP revive input and direct revive calls are no-ops even for forged downed state", () => {
    const game = createMvpGame();
    const player = game.playerBarn.addTestPlayer({});
    player.addPerk("self_revive");
    player.downed = true;

    const reviveInput = new InputMsg();
    reviveInput.addInput(GameConfig.Input.Revive);
    player.handleInput(reviveInput);
    player.revive(player);

    expect(player.getPlayerToRevive()).toBeUndefined();
    expect(player.playerBeingRevived).toBeUndefined();
    expect(player.revivedBy).toBeUndefined();
    expect(player.actionType).toBe(GameConfig.Action.None);
});
