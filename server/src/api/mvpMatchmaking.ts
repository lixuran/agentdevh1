import { MvpRules } from "../../../shared/defs/mvpRules.ts";
import { type FindGameBody, zFindGameBody } from "../../../shared/types/api.ts";
import type { FindGamePrivateBody, FindGamePrivateRes } from "../utils/types.ts";

export const MvpPublicMode = Object.freeze({
    mapName: MvpRules.mapName,
    teamMode: MvpRules.teamMode,
    enabled: true,
});

export function getMvpPublicModes() {
    return [{ ...MvpPublicMode }];
}

export function isMvpModeSelector(gameModeIdx: number): boolean {
    return Number.isInteger(gameModeIdx) && gameModeIdx === 0;
}

export type MvpGameRequest = FindGameBody;

export interface MvpMatchmakingDependencies {
    getPlayerData: () => Promise<FindGamePrivateBody["playerData"]>;
    findGame: (body: FindGamePrivateBody) => Promise<FindGamePrivateRes>;
}

export type MvpMatchmakingResult = FindGamePrivateRes | { error: "mvp_mode_only" };

export function findMvpGame(
    request: MvpGameRequest,
    dependencies: MvpMatchmakingDependencies,
): Promise<MvpMatchmakingResult>;
export function findMvpGame(
    request: unknown,
    dependencies: MvpMatchmakingDependencies,
): Promise<MvpMatchmakingResult | { error: "invalid_params" }>;
export async function findMvpGame(
    request: unknown,
    dependencies: MvpMatchmakingDependencies,
): Promise<MvpMatchmakingResult | { error: "invalid_params" }> {
    const parsedRequest = zFindGameBody.safeParse(request);
    if (!parsedRequest.success) {
        return { error: "invalid_params" };
    }

    const validRequest = parsedRequest.data;
    if (!isMvpModeSelector(validRequest.gameModeIdx)) {
        return { error: "mvp_mode_only" };
    }

    return await dependencies.findGame({
        region: validRequest.region,
        version: validRequest.version,
        mapName: MvpRules.mapName,
        teamMode: MvpRules.teamMode,
        autoFill: true,
        playerData: await dependencies.getPlayerData(),
    });
}
