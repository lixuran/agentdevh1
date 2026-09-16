import { expect, test, vi } from "vitest";
import { ApiServer } from "../../server/src/api/apiServer.ts";
import { findMvpGame, getMvpPublicModes } from "../../server/src/api/mvpMatchmaking.ts";
import { MvpRules } from "../../shared/defs/mvpRules.ts";

const validRequest = {
    region: "na",
    zones: [],
    version: 1,
    playerCount: 1,
    autoFill: false,
    gameModeIdx: 0,
};

function createDependencies() {
    return {
        getPlayerData: vi.fn(async () => []),
        findGame: vi.fn(async () => ({ urls: ["ws://game"] })),
    };
}

test("site info exposes only the enabled MVP public mode", () => {
    const expectedModes = [
        {
            mapName: MvpRules.mapName,
            teamMode: MvpRules.teamMode,
            enabled: true,
        },
    ];

    expect(getMvpPublicModes()).toEqual(expectedModes);
    expect(new ApiServer().getSiteInfo().modes).toEqual(expectedModes);
});

test("the MVP selector allocates the fixed map and solo mode", async () => {
    const dependencies = createDependencies();

    await expect(findMvpGame(validRequest, dependencies)).resolves.toEqual({ urls: ["ws://game"] });
    expect(dependencies.getPlayerData).toHaveBeenCalledOnce();
    expect(dependencies.findGame).toHaveBeenCalledOnce();
    expect(dependencies.findGame).toHaveBeenCalledWith({
        region: validRequest.region,
        version: validRequest.version,
        mapName: MvpRules.mapName,
        teamMode: MvpRules.teamMode,
        autoFill: true,
        playerData: [],
    });
});

test.each([1, -1, 0.5, Number.MAX_SAFE_INTEGER])(
    "selector %s is rejected before player data lookup or allocation",
    async (gameModeIdx) => {
        const dependencies = createDependencies();

        await expect(findMvpGame({ ...validRequest, gameModeIdx }, dependencies)).resolves.toEqual({
            error: "mvp_mode_only",
        });
        expect(dependencies.getPlayerData).not.toHaveBeenCalled();
        expect(dependencies.findGame).not.toHaveBeenCalled();
    },
);

test.each([
    { ...validRequest, gameModeIdx: "0" },
    { region: "na", zones: [], version: 1, playerCount: 1, autoFill: true },
])("malformed selectors fail Zod validation before matchmaking", (malformed) => {
    const dependencies = createDependencies();

    return expect(findMvpGame(malformed, dependencies)).resolves.toEqual({ error: "invalid_params" }).then(() => {
        expect(dependencies.getPlayerData).not.toHaveBeenCalled();
        expect(dependencies.findGame).not.toHaveBeenCalled();
    });
});
