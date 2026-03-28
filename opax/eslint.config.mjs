import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Downgrade to warn -- common pattern (loading states in effects) is not harmful
      "react-hooks/set-state-in-effect": "warn",
      // Allow explicit any -- we want to catch real type errors, not nag about any
      "@typescript-eslint/no-explicit-any": "warn",
      // Downgrade -- inline component definitions should be refactored but aren't crashes
      "react-hooks/static-components": "warn",
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
