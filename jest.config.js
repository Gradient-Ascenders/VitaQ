module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/backend/tests"],
  collectCoverage: true,
  collectCoverageFrom: [
    "backend/src/**/*.js",
    "!backend/src/server.js"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  clearMocks: true,
};