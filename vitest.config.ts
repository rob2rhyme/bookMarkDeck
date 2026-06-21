import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Seed test setup — pure, framework-free logic only (no DOM needed yet).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
