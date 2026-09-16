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

export function getMatchMaxPlayers(mapName: MapDefKey, teamMode: TeamMode, mapMaxPlayers: number): number {
    if (mapName === MvpRules.mapName && teamMode === MvpRules.teamMode) {
        return MvpRules.maxPlayers;
    }

    return mapMaxPlayers;
}
