/** Minimal jest config for framework-agnostic `lib/` unit tests and node-based
 * component tests (react-test-renderer, no RN native modules). */
const appTsconfig = require("./tsconfig.json").compilerOptions;

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/lib/**/*.test.ts",
    "<rootDir>/components/**/*.test.tsx",
  ],
  // The app tsconfig targets Metro (module esnext, jsx react-native); jest
  // needs CommonJS output and JSX that compiles, so override those bits while
  // keeping the app's strictness settings.
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // The app's nativewind `className` augmentation does not resolve in
        // this setup (every screen fails tsc the same way), so transpile
        // without full typechecking; behavior is still exercised by the tests.
        isolatedModules: true,
        tsconfig: {
          ...appTsconfig,
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
        },
      },
    ],
  },
  // sync-coordinator.test.ts is a manual dev script (console.assert, no jest
  // APIs) that imports native RN modules — running it needs the full
  // jest-expo/RN preset, which is out of scope here.
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/lib/sync-coordinator.test.ts",
  ],
  moduleNameMapper: {
    "^@env$": "<rootDir>/__mocks__/env.ts",
    "^react-native$": "<rootDir>/__mocks__/react-native.ts",
  },
};
