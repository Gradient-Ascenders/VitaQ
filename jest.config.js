module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/backend/tests"],
    collectCoverageFrom: [
        "backend/src/**/*.js",
        "!backend/src/server.js"
    ],
    coverageDirectory: "coverage",
    clearMocks: true,
};
