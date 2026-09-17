import type { Context, Next } from "hono";
import { readFile } from "node:fs/promises";
import { expect, expectTypeOf, test, vi } from "vitest";
import { usersTable } from "../../server/src/api/db/schema.ts";
import type { ProfileResponse } from "../../shared/types/user.ts";

const dbSelect = vi.hoisted(() => vi.fn());
const userWithPasswordHash = vi.hoisted(() => ({
    id: "credential-user",
    authId: "legacy-oauth-id",
    email: "Player@Example.test",
    passwordHash: "argon2id$secret-hash",
    currency: 0n,
    slug: "credential-user",
    banned: false,
    banReason: "",
    bannedBy: "",
    username: "Credential User",
    usernameSet: true,
    userCreated: new Date(),
    lastUsernameChangeTime: null,
    linked: false,
    linkedGoogle: false,
    linkedDiscord: false,
    loadout: {},
}));

vi.mock("../../server/src/api/auth/middleware.ts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../server/src/api/auth/middleware.ts")>();

    return {
        ...actual,
        authMiddleware: async (c: Context, next: Next) => {
            c.set("user" as never, userWithPasswordHash);
            c.set("session" as never, { id: "session", expiresAt: new Date() });
            await next();
        },
        databaseEnabledMiddleware: async (_c: Context, next: Next) => {
            await next();
        },
        rateLimitMiddleware: () => async (_c: Context, next: Next) => {
            await next();
        },
    };
});

vi.mock("../../server/src/api/db/index.ts", () => ({
    db: {
        select: dbSelect,
    },
}));

import { UserRouter } from "../../server/src/api/routes/user/UserRouter.ts";

type SuccessfulProfileResponse = Extract<ProfileResponse, { success: true }>;
type ProfileIncludesPasswordHash = "passwordHash" extends keyof SuccessfulProfileResponse["profile"] ? true
    : false;
type UserCurrency = typeof usersTable.$inferSelect["currency"];

test("credential migration preserves native PostgreSQL constraints and OAuth-era columns", async () => {
    const root = new URL("../..", import.meta.url);
    const [schema, migration, snapshotText] = await Promise.all([
        readFile(new URL("server/src/api/db/schema.ts", root), "utf8"),
        readFile(new URL("server/src/api/db/drizzle/0008_brief_speed.sql", root), "utf8"),
        readFile(new URL("server/src/api/db/drizzle/meta/0008_snapshot.json", root), "utf8"),
    ]);
    const snapshot = JSON.parse(snapshotText) as {
        tables: Record<string, {
            columns: Record<string, { type: string; notNull: boolean; default?: string }>;
            indexes: Record<string, { isUnique: boolean; columns: Array<{ expression: string }> }>;
            checkConstraints: Record<string, { value: string }>;
        }>;
    };
    const users = snapshot.tables["public.users"];

    expect(schema).toContain("customType<{ data: string; driverData: string }>");
    expect(schema).toContain("email: citext(\"email\")");
    expect(schema).toContain("passwordHash: text(\"password_hash\")");
    expect(schema).toContain("bigint(\"currency\", { mode: \"bigint\" }).notNull().default(0n)");
    expect(schema).toContain("uniqueIndex(\"users_email_unique\").on(table.email)");
    expect(schema).toContain("check(\"users_currency_non_negative\", sql`${table.currency} >= 0`)");

    expect(migration).toMatch(/^CREATE EXTENSION IF NOT EXISTS citext;/);
    expect(migration).toContain("ADD COLUMN \"email\" \"citext\"");
    expect(migration).toContain("ADD COLUMN \"password_hash\" text");
    expect(migration).toContain("ADD COLUMN \"currency\" bigint DEFAULT 0 NOT NULL");
    expect(migration).toContain("CREATE UNIQUE INDEX \"users_email_unique\"");
    expect(migration).toContain("ADD CONSTRAINT \"users_currency_non_negative\" CHECK");
    expect(migration).not.toMatch(/ALTER COLUMN "(id|auth_id|loadout)"/);
    expect(migration).not.toMatch(/(CREATE|DROP) TABLE "(users|session)"/);

    expect(users.columns.email).toMatchObject({ type: "citext", notNull: false });
    expect(users.columns.password_hash).toMatchObject({ type: "text", notNull: false });
    expect(users.columns.currency).toMatchObject({
        type: "bigint",
        notNull: true,
        default: "0",
    });
    expect(users.columns.auth_id).toMatchObject({ type: "text", notNull: true });
    expect(users.columns.loadout).toMatchObject({ type: "json", notNull: true });
    expect(users.indexes.users_email_unique).toMatchObject({
        isUnique: true,
        columns: [{ expression: "email" }],
    });
    expect(users.checkConstraints.users_currency_non_negative.value).toContain("currency");
    expectTypeOf<UserCurrency>().toEqualTypeOf<bigint>();
});

test("profile serializes an injected credential user through its explicit allow-list", async () => {
    dbSelect.mockReturnValue({
        from: () => ({
            where: async () => [],
        }),
    });

    const response = await UserRouter.request("http://localhost/profile", { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
        success: true,
        profile: {
            slug: "credential-user",
            username: "Credential User",
        },
    });
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("password_hash");
    expect(JSON.stringify(body)).not.toContain("argon2id$secret-hash");
    expectTypeOf<ProfileIncludesPasswordHash>().toEqualTypeOf<false>();
});
