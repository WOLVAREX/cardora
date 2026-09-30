import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addBillingInterval,
  createPaystackClient,
  getPaystackConfig,
  isCardoraPaymentReference,
  isValidPaystackAuthorizationUrl,
  verifiedTransactionMatches,
  verifyPaystackWebhookSignature,
} from "./paystack";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const config = { secretKey: "sk_test_private", appUrl: "https://cardora.example", callbackUrl: "https://cardora.example/billing/return" };

describe("Paystack manual checkout", () => {
  it("is production-only and requires the app origin to be an allowed HTTPS origin", () => {
    expect(getPaystackConfig({ NODE_ENV: "development", PAYSTACK_SECRET_KEY: "sk_live_private", CARDORA_APP_URL: "https://cardora.example" } as NodeJS.ProcessEnv)).toBeNull();
    expect(getPaystackConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_private", CARDORA_APP_URL: "http://cardora.example" } as NodeJS.ProcessEnv)).toBeNull();
    expect(getPaystackConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_private", CARDORA_APP_URL: "https://cardora.example", CARDORA_PUBLIC_ORIGINS: "https://other.example" } as NodeJS.ProcessEnv)).toBeNull();
    expect(getPaystackConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_private", CARDORA_APP_URL: "https://cardora.example/", CARDORA_PUBLIC_ORIGINS: "https://cardora.example,https://other.example" } as NodeJS.ProcessEnv))
      .toEqual({ secretKey: "sk_live_private", appUrl: "https://cardora.example", callbackUrl: "https://cardora.example/billing/return" });
  });

  it("initializes hosted one-time KES checkout with only card and mobile money channels", async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const client = createPaystackClient(config, async (input, init) => {
      calls.push({ url: new URL(String(input)), init: init ?? {} });
      return response(200, { status: true, data: { reference: "CARDORA123", access_code: "access-code", authorization_url: "https://checkout.paystack.com/abc123" } });
    });
    const checkout = await client.initializeTransaction({
      email: "owner@example.com",
      amount: 129900,
      currency: "KES",
      reference: "CARDORA123",
      callbackUrl: config.callbackUrl,
      metadata: JSON.stringify({ paymentId: 12, ownerId: 7, planId: 4 }),
    });
    expect(calls[0].url.toString()).toBe("https://api.paystack.co/transaction/initialize");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer sk_test_private" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: "owner@example.com",
      amount: 129900,
      currency: "KES",
      reference: "CARDORA123",
      callback_url: config.callbackUrl,
      channels: ["card", "mobile_money"],
      metadata: JSON.stringify({ paymentId: 12, ownerId: 7, planId: 4 }),
    });
    expect(JSON.stringify(checkout)).not.toContain("sk_test_private");
  });

  it("rejects malformed provider checkout URLs and mismatched references", async () => {
    expect(isValidPaystackAuthorizationUrl("https://checkout.paystack.com/abc")).toBe(true);
    expect(isValidPaystackAuthorizationUrl("https://evil.example/checkout")).toBe(false);
    expect(isValidPaystackAuthorizationUrl("http://checkout.paystack.com/abc")).toBe(false);
    const client = createPaystackClient(config, async () => response(200, {
      status: true,
      data: { reference: "another-reference", access_code: "access-code", authorization_url: "https://checkout.paystack.com/abc" },
    }));
    await expect(client.initializeTransaction({ email: "owner@example.com", amount: 1, currency: "KES", reference: "CARDORA123", callbackUrl: config.callbackUrl, metadata: "{}" }))
      .rejects.toThrow("Paystack could not complete the request");
  });

  it("verifies the exact raw HMAC-SHA512 webhook payload in constant-time comparison", () => {
    const raw = Buffer.from('{"event":"charge.success","data":{"reference":"CARDORA123"}}');
    const signature = createHmac("sha512", "secret-key").update(raw).digest("hex");
    expect(verifyPaystackWebhookSignature(raw, signature, "secret-key")).toBe(true);
    expect(verifyPaystackWebhookSignature(Buffer.from(`${raw.toString()} `), signature, "secret-key")).toBe(false);
    expect(verifyPaystackWebhookSignature(raw, "00", "secret-key")).toBe(false);
    expect(verifyPaystackWebhookSignature(raw, undefined, "secret-key")).toBe(false);
  });

  it("matches successful payment reference, amount and currency exactly", () => {
    const expected = { reference: "CARDORA123", amountMinor: 129900, currency: "KES" };
    expect(verifiedTransactionMatches(expected, { status: "success", reference: "CARDORA123", amount: 129900, currency: "kes" })).toBe(true);
    expect(verifiedTransactionMatches(expected, { status: "success", reference: "other", amount: 129900, currency: "KES" })).toBe(false);
    expect(verifiedTransactionMatches(expected, { status: "success", reference: "CARDORA123", amount: 129901, currency: "KES" })).toBe(false);
    expect(verifiedTransactionMatches(expected, { status: "success", reference: "CARDORA123", amount: 129900, currency: "USD" })).toBe(false);
    expect(verifiedTransactionMatches(expected, { status: "success", reference: "CARDORA123", amount: Number.MAX_SAFE_INTEGER + 1, currency: "KES" })).toBe(false);
  });

  it("adds manual calendar billing terms with safe month-end and leap-day clamping", () => {
    expect(addBillingInterval(new Date("2026-01-31T12:00:00.000Z"), "monthly").toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addBillingInterval(new Date("2024-02-29T09:15:00.000Z"), "yearly").toISOString()).toBe("2025-02-28T09:15:00.000Z");
    expect(addBillingInterval(new Date("2026-09-30T12:00:00.000Z"), "monthly").toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(isCardoraPaymentReference("CARDORA123")).toBe(false);
    expect(isCardoraPaymentReference("CARDORA0123456789abcdef0123456789abcdef")).toBe(true);
  });
});
