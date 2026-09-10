import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^(button|input|textarea|select|option|dialog|details|summary|progress)$/]",
        message: "Use the shared shadcn/ui component instead of a native interactive control.",
      }, {
        selector: "JSXAttribute[name.name='role'][value.value=/^(dialog|alertdialog|tab|tablist|tabpanel|combobox|listbox|option|checkbox|switch|progressbar)$/]",
        message: "Use the shadcn/ui primitive for this behavior and accessibility role.",
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/ocr/**"]),
]);
