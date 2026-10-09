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
    // Monaco's prebuilt assets are copied here by scripts/copy-monaco.mjs.
    "public/monaco/**",
  ]),
  {
    // Generated registry components (shadcn, assistant-ui) are vendored as-is.
    files: ["src/components/ui/**", "src/components/assistant-ui/**"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
