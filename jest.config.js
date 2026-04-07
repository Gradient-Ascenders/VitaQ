module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/backend/tests"],
    collectCoverageFrom: [
        "backend/src/**/*.js",
        "!backend/src/server.js"
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov"],
    clearMocks: true,
};
