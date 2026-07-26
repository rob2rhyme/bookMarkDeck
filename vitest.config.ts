import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two projects so DOM/hook tests can use jsdom without disturbing the large
// node-only pure-logic suite. Convention: `*.dom.test.tsx` → jsdom; every other
// `*.test.{ts,tsx}` → node (the existing suite, unchanged).
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.dom.test.{ts,tsx}", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.dom.ts"],
        },
      },
    ],
  },
});
