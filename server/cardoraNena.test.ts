import { describe, expect, it } from "vitest";
import { createNenaClient, NenaProviderError, resolveNenaSenderId } from "./cardoraNena";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Nena SMS client", () => {
  it("resolves only an active sender whose label or value is exactly NENA.", () => {
    expect(resolveNenaSenderId([
      { id: "inactive", value: "NENA.", is_active: false },
      { id: "other", label: "Other", value: "OTHER", is_active: true },
      { id: "chosen", label: "Business sender", value: "NENA.", is_active: true },
    ])?.id).toBe("chosen");
    expect(resolveNenaSenderId([{ id: "near", label: "NENA Default Sender", value: "NENASMS", is_active: true }])).toBeNull();
  });

  it("resolves the sender UUID first and sends the documented single-recipient request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createNenaClient({ apiKey: "test-key", baseUrl: "https://nena.test/v1/api", fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/sender-ids")) return response(200, { data: [{ id: "sender-uuid", value: "NENA.", is_active: true }] });
      return response(201, { data: { accepted: ["254713046497"], skipped: [], id: "message-id", status: "queued" } });
    } });
    const result = await client.send("+254713046497", "Verification code 123456");
    expect(result).toEqual({ status: "queued", accepted: ["254713046497"], skippedCount: 0, providerMessageId: "message-id" });
    expect(calls).toHaveLength(2);
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ sender_id: "sender-uuid", to: "+254713046497", message: "Verification code 123456" });
  });

  it("does not treat HTTP 201 as success when Nena reports failed", async () => {
    const client = createNenaClient({ apiKey: "test-key", fetcher: async url => String(url).endsWith("/sender-ids")
      ? response(200, { data: [{ id: "sender-uuid", label: "NENA.", is_active: true }] })
      : response(201, { data: { accepted: [], skipped: [{ to: "254713046497", reason: "upstream_failed" }], status: "failed" } }) });
    await expect(client.send("+254713046497", "A test")).rejects.toMatchObject({ reason: "not_queued", httpStatus: 201 });
  });

  it("fails closed when the NENA. sender is not assigned and never calls send", async () => {
    const calls: string[] = [];
    const client = createNenaClient({ apiKey: "test-key", fetcher: async url => {
      calls.push(String(url));
      return response(200, { data: [{ id: "other", value: "NENASMS", is_active: true }] });
    } });
    await expect(client.send("+254713046497", "A test")).rejects.toMatchObject({ reason: "sender_unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("surfaces forbidden provider access without leaking credentials or claiming a send", async () => {
    const client = createNenaClient({ apiKey: "test-key", fetcher: async () => response(403, { message: "Forbidden" }) });
    await expect(client.send("+254713046497", "A test")).rejects.toBeInstanceOf(NenaProviderError);
    const status = await client.connectionStatus();
    expect(status).toMatchObject({ configured: true, wallet: "denied", sender: "denied" });
    expect(JSON.stringify(status)).not.toContain("test-key");
  });

  it("enforces Nena's 50-recipient request cap before calling the provider", async () => {
    let calls = 0;
    const client = createNenaClient({ apiKey: "test-key", fetcher: async () => { calls += 1; return response(200, { data: [] }); } });
    await expect(client.send(Array.from({ length: 51 }, (_, index) => `+254700000${String(index).padStart(3, "0")}`), "A test"))
      .rejects.toMatchObject({ reason: "recipient_limit" });
    expect(calls).toBe(0);
  });
});
