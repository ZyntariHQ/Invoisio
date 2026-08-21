/** Minimal jest config for framework-agnostic `lib/` unit tests (no RN renderer). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/lib/**/*.test.ts"],
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
