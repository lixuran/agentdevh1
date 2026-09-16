import { getConfig } from "../../config.ts";

const isProd = process.env["NODE_ENV"] === "production";
const isTest = process.env["SURVEV_TEST_CONFIG"] === "true";
export const serverConfigPath = isProd ? "../../" : "";
// to remove "server/dist" from the path to load the config from...
export const Config = getConfig(isProd, serverConfigPath, isTest);
