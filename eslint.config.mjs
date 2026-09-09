import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app deliberately hydrates client state from localStorage inside an
      // effect and then sets a `hydrated` flag (CLAUDE.md "State & persistence
      // pattern" — the SSR-safe approach here). This rule flags that intentional
      // pattern, so keep it visible as a warning rather than a hard error.
      "react-hooks/set-state-in-effect": "warn",
      // `const { secret: _drop, ...rest } = obj` is how this codebase omits a
      // key. The discard is unused by definition, so name the convention rather
      // than sprinkle disables: a leading underscore means "intentionally unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
