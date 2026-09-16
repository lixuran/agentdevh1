import fs from "node:fs";
import { expect, test, vi } from "vitest";
import { getConfig } from "../../config.ts";
import { Config } from "../../server/src/config.ts";

test("test configuration uses in-memory defaults without file I/O", () => {
    const existsSync = vi.spyOn(fs, "existsSync");
    const readFileSync = vi.spyOn(fs, "readFileSync");
    const writeFileSync = vi.spyOn(fs, "writeFileSync");

    const config = getConfig(false, "", true);

    expect(config.secrets).toEqual({
        SURVEV_API_KEY: "",
        SURVEV_IP_SECRET: "",
    });
    expect(existsSync).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
});

test("server configuration uses Vitest defaults", () => {
    expect(Config.secrets).toEqual({
        SURVEV_API_KEY: "",
        SURVEV_IP_SECRET: "",
    });
});
