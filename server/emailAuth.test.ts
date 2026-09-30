import { describe, expect, it } from "vitest";
import { digestSessionToken, hashPassword, isEmailCollision, normalizeEmail, verifyPassword } from "./emailAuth";
import { csrfTokenMatches } from "./_core/csrf";

describe("Cardora email authentication primitives", () => {
  it("hashes passwords with a unique scrypt salt and verifies them", async () => {
    const first = await hashPassword("correct horse battery staple 42");
    const second = await hashPassword("correct horse battery staple 42");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    await expect(verifyPassword("correct horse battery staple 42", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it("normalizes addresses and refuses sign-up collisions with legacy email identities", () => {
    const address = normalizeEmail("  Legacy.Owner@Example.com  ");
    expect(address).toBe("legacy.owner@example.com");
    expect(isEmailCollision(address, [{ email: "Legacy.Owner@example.com", emailAuthEmail: null }])).toBe(true);
    expect(isEmailCollision(address, [{ email: null, emailAuthEmail: "legacy.owner@example.com" }])).toBe(true);
    expect(isEmailCollision(address, [{ email: "different@example.com", emailAuthEmail: null }])).toBe(false);
  });

  it("stores only a fixed-length SHA-256 session digest, not the bearer token", () => {
    const rawToken = "opaque-session-token-for-this-test";
    const digest = digestSessionToken(rawToken);
    expect(digest).toHaveLength(64);
    expect(digest).not.toBe(rawToken);
    expect(digestSessionToken(rawToken)).toBe(digest);
  });

  it("requires a matching double-submit token and rejects absent or mismatched values", () => {
    const token = "a".repeat(43);
    expect(csrfTokenMatches(token, token)).toBe(true);
    expect(csrfTokenMatches(token, "b".repeat(43))).toBe(false);
    expect(csrfTokenMatches(undefined, token)).toBe(false);
    expect(csrfTokenMatches(token, undefined)).toBe(false);
  });
});
