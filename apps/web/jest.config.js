const nextJest = require("next/jest");

// next/jest loads the Next.js SWC transform + next.config.mjs + .env for us.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  // Some deps (undici, jest-dom) key their exports off this condition; jsdom
  // needs it set explicitly or "instanceof Response" etc. checks misbehave.
  testEnvironmentOptions: { customExportConditions: [""] },
};

module.exports = createJestConfig(customJestConfig);
