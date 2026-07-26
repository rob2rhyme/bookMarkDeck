import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The ported `src/lib/*` modules are pure and framework-free by design, so they
// run under plain node — exactly as they did in the web app. Keeping these
// tests green IS the correctness proof of the port.
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
