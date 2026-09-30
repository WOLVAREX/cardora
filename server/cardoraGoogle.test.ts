import { describe, expect, it } from "vitest";
import { createCodeChallenge, createCodeVerifier, createGoogleConsentUrl, decryptRefreshToken, encryptRefreshToken, GMAIL_SCOPES, gmailRawMessage } from "./cardoraGoogle";

describe("production Gmail OAuth helpers", () => {
  const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://cardora.example/api/cardora/google/callback", encryptionKey: "", configured: true };
  it("uses owner-bound state, PKCE, offline access and the minimum Gmail sending scope", () => {
    const verifier = createCodeVerifier();
    const url = new URL(createGoogleConsentUrl({ state: "one-time-state", codeChallenge: createCodeChallenge(verifier), config }));
    expect(url.searchParams.get("state")).toBe("one-time-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(createCodeChallenge(verifier));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...GMAIL_SCOPES]);
  });

  it("encrypts refresh tokens with authenticated AES-GCM and rejects a wrong key", () => {
    const key = Buffer.alloc(32, 9).toString("base64url");
    const encrypted = encryptRefreshToken("refresh-token-value", key);
    expect(encrypted.encryptedRefreshToken).not.toContain("refresh-token-value");
    expect(decryptRefreshToken(encrypted, key)).toBe("refresh-token-value");
    expect(() => decryptRefreshToken(encrypted, Buffer.alloc(32, 8).toString("base64url"))).toThrow(/could not be decrypted/i);
  });

  it("encodes subject headers and newlines safely in Gmail's base64url MIME message", () => {
    const encoded = gmailRawMessage("person@example.com", "A & thoughtful update", "Hello, friend\nManage preferences: https://cardora.example/c/a?unsubscribe=token");
    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    expect(raw).toContain("To: person@example.com\r\n");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("Hello, friend\r\nManage preferences:");
    expect(raw.replace(/\r\n/g, "")).not.toContain("\nManage preferences:");
  });

  it("rejects header injection and malformed recipient addresses", () => {
    expect(() => gmailRawMessage("person@example.com\r\nBcc: outsider@example.com", "Hello", "Body")).toThrow(/invalid/i);
    expect(() => gmailRawMessage("person@example.com", "Hello\nBcc: outsider@example.com", "Body")).toThrow(/line breaks/i);
  });
});
