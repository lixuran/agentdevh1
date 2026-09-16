import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { Client } from "../../server/src/game/client.ts";
import type { JoinTokenData } from "../../server/src/game/game.ts";
import { NoOpSocket } from "../../server/src/game/socket.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import { EmoteMsg } from "../../shared/net/emoteMsg.ts";
import { JoinMsg } from "../../shared/net/joinMsg.ts";
import { MsgType } from "../../shared/net/net.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

function createMvpGame() {
    const game = createGame(MvpRules.teamMode, "test_normal");
    game.mapName = MvpRules.mapName;
    game.started = true;
    return game;
}

function joinMvpPlayer(
    game: ReturnType<typeof createMvpGame>,
    joinLoadout: JoinMsg["loadout"],
    tokenLoadout?: JoinTokenData["loadout"],
) {
    const joinMsg = new JoinMsg();
    joinMsg.name = "MVP Player";
    joinMsg.loadout = joinLoadout;

    return game.clientBarn.addClientWithPlayer(
        new NoOpSocket<Client>(),
        {
            userId: null,
            findGameIp: "127.0.0.1",
            loadout: tokenLoadout,
        },
        joinMsg,
    )!.player!;
}

const hostileJoinLoadout: JoinMsg["loadout"] = {
    outfit: "outfitTank",
    melee: "katana",
    heal: "heal_5",
    boost: "boost_soda",
    emotes: ["emote_happyface", "emote_thumbsup"],
};

test("MVP spawn ignores absent, legacy, and malformed cosmetic loadouts", () => {
    const game = createMvpGame();
    const tokenLoadout = {
        outfit: "outfitTank",
        melee: "katana",
        heal: "heal_5",
        boost: "boost_soda",
        player_icon: "emote_happyface",
        crosshair: { type: "crosshair_001", color: 0, size: "5", stroke: "5" },
        emotes: ["emote_happyface"],
    } as never;

    const absentLoadoutPlayer = joinMvpPlayer(createMvpGame(), new JoinMsg().loadout);
    const player = joinMvpPlayer(game, hostileJoinLoadout, tokenLoadout);
    player.setLoadout({ outfit: "not-an-outfit", emotes: ["not-an-emote"] } as never);

    expect(absentLoadoutPlayer.outfit).toBe("outfitBase");
    expect(absentLoadoutPlayer.loadout.emotes).toEqual([]);
    expect(player.outfit).toBe("outfitBase");
    expect(player.loadout).toEqual({
        outfit: "outfitBase",
        heal: "heal_basic",
        boost: "boost_basic",
        emotes: [],
    });
});

test("MVP cosmetic outfit loot and direct outfit calls cannot replace the base avatar", () => {
    const game = createMvpGame();
    const player = joinMvpPlayer(game, hostileJoinLoadout);
    game.lootBarn.addLoot("outfitTank", v2.copy(player.pos), player.layer, 1, {});

    player.pickupLoot(game.lootBarn.loots.at(-1)!);
    player.setOutfit("outfitTank");

    expect(player.outfit).toBe("outfitBase");
    expect(game.lootBarn.loots.at(-1)!.destroyed).toBe(false);
});

test("MVP forged emote and ping frames are no-ops with no player-barn broadcast state", () => {
    const game = createMvpGame();
    const player = joinMvpPlayer(game, hostileJoinLoadout);
    const addEmote = vi.spyOn(game.playerBarn, "addEmote");
    const addMapPing = vi.spyOn(game.playerBarn, "addMapPing");
    const emote = new EmoteMsg();
    emote.type = "emote_happyface";
    const ping = new EmoteMsg();
    ping.type = "ping_danger";
    ping.isPing = true;
    ping.pos = v2.copy(player.pos);

    player.emoteFromMsg(emote);
    player.client.handleMsg(MsgType.Emote, ping);

    expect(game.playerBarn.emotes).toEqual([]);
    expect(addEmote).not.toHaveBeenCalled();
    expect(addMapPing).not.toHaveBeenCalled();
});

test("MVP Joined messages do not seed emotes", () => {
    const game = createMvpGame();
    const player = joinMvpPlayer(game, hostileJoinLoadout);
    const serializeMsg = vi.spyOn(player.client.msgStream, "serializeMsg");

    player.client.sendMsgs();

    expect(serializeMsg).toHaveBeenCalledWith(
        MsgType.Joined,
        expect.objectContaining({ emotes: [] }),
    );
});

test("MVP client fixes cosmetic defaults and leaves cosmetic controls and transport unmounted", async () => {
    const root = new URL("../..", import.meta.url);
    const [account, crosshair, game, index] = await Promise.all([
        readFile(new URL("client/src/account.ts", root), "utf8"),
        readFile(new URL("client/src/crosshair.ts", root), "utf8"),
        readFile(new URL("client/src/game.ts", root), "utf8"),
        readFile(new URL("client/index.html", root), "utf8"),
    ]);

    expect(account).not.toContain("fetchApi(\"loadout\"");
    expect(crosshair).toContain("type: \"crosshair_default\"");
    expect(crosshair).toContain("color: 0xffffff");
    expect(crosshair).toContain("size: \"1.00\"");
    expect(crosshair).toContain("stroke: \"0.00\"");
    expect(game).toContain("const mvpJoinLoadout");
    expect(game).not.toContain("m_sendMessage(net.MsgType.Emote");
    expect(game).not.toContain("updateEmoteWheel(msg.emotes)");
    expect(game).not.toContain("m_emoteBarn.m_render");
    expect(index).toContain("template id=\"legacy-emote-wheels\"");
    expect(index).toContain("template id=\"legacy-cosmetic-loadout\"");
    expect(index).not.toContain("id=\"btn-customize\"");
    expect(index).not.toContain("class=\"account-link account-loadout-link\"");
    expect(index).not.toContain("id=\"ui-emote-button\"");
});
