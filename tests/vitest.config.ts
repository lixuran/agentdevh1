import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        env: {
            SURVEV_TEST_CONFIG: "true",
        },
        fileParallelism: false,
        setupFiles: ["./src/testHelpers.ts"],
    },
});
