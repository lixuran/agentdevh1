import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { getFindGamePlayerData } from "../../server/src/api/apiHelpers.ts";
import { UserRouter } from "../../server/src/api/routes/user/UserRouter.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import { MsgType } from "../../shared/net/net.ts";
import { createGame } from "./gameTestHelpers.ts";

const dbSelect = vi.hoisted(() => vi.fn());

vi.mock("../../server/src/api/db/index.ts", () => ({
    db: {
        select: dbSelect,
    },
}));

test.each([
    ["get_pass", undefined, "not json"],
    ["refresh_quest", "session=invalid", JSON.stringify({ idx: "not-a-number" })],
    ["set_pass_unlock", "session=invalid", JSON.stringify({ unlockType: "legacy" })],
])(
    "MVP public pass route /%s returns its fixed 404 before authentication or validation",
    async (path, cookie, body) => {
        dbSelect.mockClear();

        const response = await UserRouter.request(`http://localhost/${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(cookie ? { cookie } : {}),
            },
            body,
        });

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "mvp_feature_disabled" });
        expect(dbSelect).not.toHaveBeenCalled();
    },
);

test("MVP matchmaking hands players to the game without legacy quest ids", async () => {
    dbSelect.mockReturnValue({
        from: () => ({
            where: async () => [{ userId: "account", loadout: undefined }],
        }),
    });

    const playerData = await getFindGamePlayerData([
        {
            joinToken: "join-token",
            userId: "account",
            ip: "127.0.0.1",
        },
    ]);

    expect(playerData).toEqual([
        {
            joinToken: "join-token",
            userId: "account",
            ip: "127.0.0.1",
            loadout: undefined,
        },
    ]);
    expect(dbSelect).toHaveBeenCalledWith({
        userId: expect.anything(),
        loadout: expect.anything(),
    });
});

test("MVP gameplay ignores forged quest state before pass packets or private progress reporting", () => {
    const game = createGame(MvpRules.teamMode, "test_normal");
    game.mapName = MvpRules.mapName;
    const player = game.playerBarn.addTestPlayer({ userId: "account" });
    player.questManager.quests = [{ id: "quest_kills", delta: 0, totalDelta: 0 }];

    const reportProgress = vi.spyOn(game, "sendQuestProgress");
    const sendInstantMessage = vi.spyOn(player.client, "sendInstantMsg");

    player.questManager.trackEvent("kill", {});
    player.questManager.flushProgress();

    expect(player.questManager.quests[0]).toMatchObject({ delta: 0, totalDelta: 0 });
    expect(reportProgress).not.toHaveBeenCalled();
    expect(sendInstantMessage).not.toHaveBeenCalledWith(MsgType.UpdatePass, expect.anything());
});

test("the MVP client no longer depends on pass UI or pass requests during startup", async () => {
    const root = new URL("../..", import.meta.url);
    const [account, main, loadoutMenu, index, userRouter] = await Promise.all([
        readFile(new URL("client/src/account.ts", root), "utf8"),
        readFile(new URL("client/src/main.ts", root), "utf8"),
        readFile(new URL("client/src/ui/loadoutMenu.ts", root), "utf8"),
        readFile(new URL("client/index.html", root), "utf8"),
        readFile(new URL("server/src/api/routes/user/UserRouter.ts", root), "utf8"),
    ]);

    expect(account).not.toContain("get_pass");
    expect(account).not.toContain("refresh_quest");
    expect(account).not.toContain("set_pass_unlock");
    expect(main).not.toContain("new Pass");
    expect(loadoutMenu).not.toContain("setPassUnlock");
    expect(index).not.toContain("pass-wrapper");
    expect(index).not.toContain("pass-toggle");
    expect(userRouter.indexOf(".route(\"/\", MvpPassRouter)")).toBeLessThan(userRouter.indexOf(".use(authMiddleware)"));
});
