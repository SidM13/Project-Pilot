import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src(""),
      // `server-only` throws outside a React Server Components build; tests run server code directly.
      "server-only": src("lib/demo/__tests__/server-only-stub.ts"),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
