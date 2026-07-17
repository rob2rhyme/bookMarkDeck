import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The logic core is framework-free — node environment, no DOM emulation.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
