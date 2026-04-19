// Keep one tiny smoke test so Jest fails loudly if the test environment stops booting at all.
describe("smoke test", () => {
  test("basic sanity check", () => {
    expect(1 + 1).toBe(2);
  });
});
