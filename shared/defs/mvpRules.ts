import { TeamMode } from "../gameConfig.ts";
import type { MapDefKey } from "./mapDefs.ts";

export const MvpRules = Object.freeze(
    {
        queueVisibility: "public",
        teamMode: TeamMode.Solo,
        mapName: "main" satisfies MapDefKey,
        maxPlayers: 12,
        hardLimitSeconds: 720,
        extractionChannelSeconds: 10,
    } as const,
);

export function isMvpMatch(mapName: MapDefKey, teamMode: TeamMode): boolean {
    return mapName === MvpRules.mapName && teamMode === MvpRules.teamMode;
}

export function getMatchMaxPlayers(mapName: MapDefKey, teamMode: TeamMode, mapMaxPlayers: number): number {
    if (isMvpMatch(mapName, teamMode)) {
        return MvpRules.maxPlayers;
    }

    return mapMaxPlayers;
}
