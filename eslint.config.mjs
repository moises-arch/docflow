import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/**",
    "src/lib/supabase/database.types.ts",
  ]),
  {
    rules: {
      // ── Design system enforcement ──────────────────────────────
      // Block rounded-lg and larger — only rounded-sm / rounded-md allowed
      // (rounded-full is ok on avatars — add eslint-disable comment locally)
      "no-restricted-syntax": [
        "error",
        {
          // Block large border-radius Tailwind classes.
          // Pattern split to avoid triggering the rule on itself.
          // rounded-full IS allowed on Avatar — add eslint-disable-next-line locally.
          selector: "JSXAttribute > Literal[value=/\\b" + "rounded-(lg|xl|2xl|3xl|full)" + "\\b/]",
          message:
            "Use rounded-sm (4px) or rounded-md (6px) only. " +
            "rounded-full is allowed on avatars — add eslint-disable-next-line comment.",
        },
      ],
      // ── General quality ─────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
]);

export default eslintConfig;
