import { expect, expectTypeOf, test } from "vitest";
import { MvpRules } from "../../shared/defs/mvpRules.ts";
import { TeamMode } from "../../shared/gameConfig.ts";

test("MvpRules exposes the fixed solo-extraction contract", () => {
    expect(MvpRules).toEqual({
        queueVisibility: "public",
        teamMode: TeamMode.Solo,
        mapName: "main",
        maxPlayers: 12,
        hardLimitSeconds: 720,
        extractionChannelSeconds: 10,
    });
    expect(Object.keys(MvpRules)).toEqual([
        "queueVisibility",
        "teamMode",
        "mapName",
        "maxPlayers",
        "hardLimitSeconds",
        "extractionChannelSeconds",
    ]);
});

test("MvpRules cannot be changed at runtime", () => {
    expect(Object.isFrozen(MvpRules)).toBe(true);
    expect(Reflect.set(MvpRules, "maxPlayers", 24)).toBe(false);
    expect(MvpRules.maxPlayers).toBe(12);
});

test("MvpRules retains its fixed literal TypeScript values", () => {
    expectTypeOf(MvpRules.queueVisibility).toEqualTypeOf<"public">();
    expectTypeOf(MvpRules.teamMode).toEqualTypeOf<TeamMode.Solo>();
    expectTypeOf(MvpRules.mapName).toEqualTypeOf<"main">();
    expectTypeOf(MvpRules.maxPlayers).toEqualTypeOf<12>();
    expectTypeOf(MvpRules.hardLimitSeconds).toEqualTypeOf<720>();
    expectTypeOf(MvpRules.extractionChannelSeconds).toEqualTypeOf<10>();
});
