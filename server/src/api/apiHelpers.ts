import { inArray } from "drizzle-orm";
import type { Context } from "hono";
import { isIP } from "node:net";
import { db } from "../api/db/index.ts";
import { usersTable } from "../api/db/schema.ts";
import { Config } from "../config.ts";
import type { FindGamePrivateBody } from "../utils/types.ts";

export function getHonoIp(c: Context, proxyHeader?: string): string | undefined {
    const ip = proxyHeader
        ? c.req.header(proxyHeader)
        : c.env?.incoming?.socket?.remoteAddress;

    if (!ip || isIP(ip) == 0) return undefined;
    if (ip.includes("::ffff:")) return ip.split("::ffff:")[1];
    return ip;
}

export async function verifyTurnsStile(token: string, ip: string): Promise<boolean> {
    const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const result = await fetch(url, {
        body: JSON.stringify({
            secret: Config.secrets.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: ip,
        }),
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    });

    const outcome = await result.json();

    if (!outcome.success) {
        return false;
    }
    return true;
}

export async function getFindGamePlayerData(
    players: Pick<FindGamePrivateBody["playerData"][number], "joinToken" | "userId" | "ip">[],
): Promise<FindGamePrivateBody["playerData"]> {
    const userIds = [
        ...new Set(players.map((p) => p.userId).filter((id) => id !== null)),
    ];

    let accountData: Record<
        string,
        {
            loadout: FindGamePrivateBody["playerData"][0]["loadout"];
        }
    > = {};

    if (userIds.length) {
        const query = await db
            .select({
                userId: usersTable.id,
                loadout: usersTable.loadout,
            })
            .from(usersTable)
            .where(inArray(usersTable.id, userIds));

        accountData = Object.fromEntries(query.map((r) => [r.userId, r]));
    }

    return players.map(({ joinToken, userId, ip }) => ({
        joinToken,
        userId,
        ip,
        loadout: userId ? accountData[userId]?.loadout : undefined,
    }));
}
