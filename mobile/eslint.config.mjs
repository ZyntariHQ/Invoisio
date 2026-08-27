import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Flags Pressable/TouchableOpacity elements that ship without an accessible
 * name or role:
 * - A name may come from an explicit accessibilityLabel/aria-label or from
 *   visible text content (React Native derives the name from the element's
 *   text children). Icon-only controls therefore require a label.
 * - A role must be explicit: neither Pressable nor TouchableOpacity defaults
 *   to accessibilityRole="button" in React Native. The role check autofixes
 *   by inserting accessibilityRole="button".
 */
const a11yInteractiveNameRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Pressable and TouchableOpacity must expose an accessible name and role",
    },
    messages: {
      missingLabel:
        "Interactive element <{{name}}> has no accessible name. Add an accessibilityLabel (or aria-label) \u2014 especially for icon-only controls, which have no text for a screen reader to fall back on.",
      missingRole:
        "Interactive element <{{name}}> has no accessibilityRole. Add accessibilityRole=\"button\" so screen readers announce it as a button.",
    },
    fixable: "code",
  },
  create(context) {
    const INTERACTIVE_COMPONENTS = new Set(["Pressable", "TouchableOpacity"]);
    const LABEL_ATTRIBUTES = new Set(["accessibilityLabel", "aria-label"]);

    function hasAttribute(node, names) {
      return node.attributes.some(
        (attr) =>
          attr.type === "JSXAttribute" &&
          attr.name.type === "JSXIdentifier" &&
          names.has(attr.name.name),
      );
    }

    // Gather any visible text content. JSXExpressionContainer values may
    // contain text at runtime, so they are treated as an accessible name.
    function collectText(node, found) {
      if (found.hasText) return;
      for (const child of node.children ?? []) {
        if (child.type === "JSXText" && /[A-Za-z0-9]/.test(child.value)) {
          found.hasText = true;
          return;
        }
        if (child.type === "JSXExpressionContainer") {
          found.hasText = true;
          return;
        }
        if (child.type === "JSXElement") {
          collectText(child, found);
          if (found.hasText) return;
        }
        if (child.type === "JSXFragment") {
          collectText(child, found);
          if (found.hasText) return;
        }
      }
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (!INTERACTIVE_COMPONENTS.has(node.name.name)) return;

        if (!hasAttribute(node, LABEL_ATTRIBUTES)) {
          const found = { hasText: false };
          collectText(node.parent, found);
          if (!found.hasText) {
            context.report({
              node,
              messageId: "missingLabel",
              data: { name: node.name.name },
            });
          }
        }

        if (!hasAttribute(node, new Set(["accessibilityRole"]))) {
          const sourceCode = context.sourceCode;
          context.report({
            node,
            messageId: "missingRole",
            data: { name: node.name.name },
            fix(fixer) {
              // Insert on its own line so the result matches the project's
              // one-attribute-per-line style (and Prettier's expectations).
              return fixer.insertTextAfter(
                node.name,
                "\n  accessibilityRole=\"button\"",
              );
            },
          });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "android/**",
      "ios/**",
      "eslint.config.mjs",
      "babel.config.js",
      "tailwind.config.js",
      "metro.config.js",
      "jest.config.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.{ts,tsx}", "app/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      invoisio: {
        rules: {
          "a11y-interactive-name": a11yInteractiveNameRule,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "invoisio/a11y-interactive-name": "error",
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
    },
  },
);
