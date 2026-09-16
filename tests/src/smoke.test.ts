import { expect, test } from "vitest";
import { math } from "../../shared/utils/math.ts";

test("shared math smoke test", () => {
    expect(math.clamp(12, 0, 10)).toBe(10);
});
