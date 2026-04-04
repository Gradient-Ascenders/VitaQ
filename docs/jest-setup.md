# Jest + GitHub Actions Setup

## 1. Initialized the Node project

A `package.json` was created in the repo root:

```bash
npm init -y
```

Then Jest was installed as a dev dependency:

```bash
npm install --save-dev jest
```

---

## 2. Added `.gitignore`

A `.gitignore` file was added so unnecessary generated files are not committed:

```text
node_modules/
coverage/
.env
dist/
```

---

## 3. Added Jest scripts

The `package.json` scripts were updated.

Initial version:

```json
"scripts": {
  "test": "jest",
  "test:coverage": "jest --coverage"
}
```

Because there were no real tests yet, this was later changed to allow CI to pass during setup:

```json
"scripts": {
  "test": "jest --passWithNoTests",
  "test:coverage": "jest --coverage --passWithNoTests"
}
```

---

## 4. Added Jest config

A root `jest.config.js` was created for backend-focused testing:

```jsx
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
```

This means:

- tests are currently expected in `backend/tests`
- coverage is collected from `backend/src`
- `lcov` output is generated for future coverage tooling

---

## 5. Added GitHub Actions workflow

A workflow file was created at: `.github/workflows/test.yml`

Current version runs Jest coverage in CI:

```yaml
name: Test and Coverage

on:
  push:
    branches: [main, setup/jest]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage
```

---

## Problems encountered

### Workflow indentation issue

At first, the workflow failed because `jobs:` was indented incorrectly and ended up inside `on:`.

### Wrong Codecov action

An incorrect Codecov action was used initially, which caused an action resolution error.

### No tests found

Since there are no committed test files yet, Jest failed in CI with:

```
No tests found, exiting with code 1
```

This was fixed temporarily using:

```json
--passWithNoTests
```

### Codecov setup postponed

Codecov upload was removed for now because:

- there are no meaningful tests yet
- coverage would show 0%
- it would require extra setup such as token configuration later

---

## Current state

At this point:

- Jest is installed
- backend-focused Jest config exists
- GitHub Actions is set up
- CI can run successfully even before real tests are added
- repo structure has been planned
- Codecov is postponed until real tests exist

---

## Next step

### 1. re-enable Codecov

Change `.github/workflows/test.yml` to:

```yaml
name: Test and Coverage

on:
  push:
    branches: [main, setup/jest]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v6
        with:
          files: ./coverage/lcov.info
          token: ${{ secrets.CODECOV_TOKEN }}
```

### 2. Add a coverage badge to the README

The README will have something like:

```markdown
![Coverage](<your-badge-url-here>)
```
