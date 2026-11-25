import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/vitest-setup-kline.ts"],
  },
});
