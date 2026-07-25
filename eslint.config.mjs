import javascript from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

/**
 * Configuración única para todo el monorepo.
 *
 * El lint es con información de tipos: `projectService` resuelve el
 * `tsconfig.json` de cada workspace, de modo que una regla que necesita tipos
 * funciona igual en `apps/*`, `packages/*` y `tools/*`. Un archivo TypeScript
 * fuera de todo `tsconfig.json` produce un error de parseo y detiene el lint.
 *
 * Las reglas agregadas sobre el preset estricto codifican invariantes del
 * manual operativo: nada de `any`, tipos explícitos en los bordes y
 * exhaustividad en las uniones que representan estados.
 */
export default typescriptEslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/node_modules/**",
    ],
  },
  {
    files: ["**/*.mjs"],
    extends: [javascript.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.nodeBuiltin,
      sourceType: "module",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      javascript.configs.recommended,
      typescriptEslint.configs.strictTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: false, allowTypedFunctionExpressions: true },
      ],
      // Los módulos dinámicos de NestJS son clases decoradas con métodos
      // estáticos de composición; es el patrón oficial del framework.
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowWithDecorator: true },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // `node:test` devuelve una promesa que el propio runner espera.
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    extends: [
      nextPlugin.configs["core-web-vitals"],
      reactHooks.configs.flat["recommended-latest"],
    ],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
    settings: {
      next: { rootDir: "apps/web" },
    },
  },
);
