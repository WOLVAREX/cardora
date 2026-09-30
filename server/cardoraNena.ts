const NENA_BASE_URL = "https://nenasolutions.co.ke/v1/api";
const REQUIRED_SENDER = "NENA.";

export type NenaSender = {
  id: string;
  label?: string;
  value?: string;
  is_active?: boolean;
};

type NenaEnvelope<T> = { data?: T; message?: string };
type NenaFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class NenaProviderError extends Error {
  constructor(message: string, readonly httpStatus?: number, readonly reason = "provider_error") {
    super(message);
    this.name = "NenaProviderError";
  }
}

export type NenaDeliveryResult = {
  status: "queued";
  accepted: string[];
  skippedCount: number;
  providerMessageId?: string;
};

export type NenaConnectionStatus = {
  configured: boolean;
  wallet: "available" | "denied" | "unavailable" | "not_configured";
  credits: number | null;
  sender: "available" | "not_assigned" | "denied" | "unavailable" | "not_configured";
  senderLabel: string | null;
};

export function resolveNenaSenderId(senders: NenaSender[], wanted = REQUIRED_SENDER): NenaSender | null {
  return senders.find(sender => sender.is_active === true && sender.id && (sender.value === wanted || sender.label === wanted)) ?? null;
}

export function canonicalNenaNumber(number: string) {
  return number.replace(/^\+/, "").replace(/\D/g, "");
}

function getData<T>(body: unknown): T | undefined {
  if (!body || typeof body !== "object" || !("data" in body)) return undefined;
  return (body as NenaEnvelope<T>).data;
}

export function createNenaClient(options: { apiKey?: string; baseUrl?: string; fetcher?: NenaFetch } = {}) {
  const apiKey = options.apiKey ?? process.env.NENA_API_KEY ?? "";
  const baseUrl = (options.baseUrl ?? NENA_BASE_URL).replace(/\/+$/, "");
  const fetcher = options.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}) {
    if (!apiKey) throw new NenaProviderError("Nena SMS is not configured on this server.", undefined, "not_configured");
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(15000),
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      });
    } catch {
      throw new NenaProviderError("Nena could not be reached. No message was confirmed as queued.", undefined, "network_error");
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { body = undefined; }
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403 ? "access_denied" : "provider_error";
      throw new NenaProviderError(response.status === 401 || response.status === 403 ? "Nena denied API access. No message was sent." : "Nena rejected the request. No message was confirmed as queued.", response.status, reason);
    }
    return { body, status: response.status };
  }

  async function listSenders() {
    const result = await request<unknown>("/sender-ids");
    const data = getData<unknown>(result.body);
    if (!Array.isArray(data)) throw new NenaProviderError("Nena returned an invalid sender list.", result.status, "invalid_response");
    return data as NenaSender[];
  }

  async function senderForRequiredId() {
    const sender = resolveNenaSenderId(await listSenders());
    if (!sender) throw new NenaProviderError("The active Nena sender ID NENA. is not assigned to this account.", undefined, "sender_unavailable");
    return sender;
  }

  return {
    async connectionStatus(): Promise<NenaConnectionStatus> {
      if (!apiKey) return { configured: false, wallet: "not_configured", credits: null, sender: "not_configured", senderLabel: null };
      const [walletResult, senderResult] = await Promise.allSettled([request<unknown>("/wallet/balance"), listSenders()]);
      let wallet: NenaConnectionStatus["wallet"] = "unavailable";
      let credits: number | null = null;
      if (walletResult.status === "fulfilled") {
        const data = getData<{ credits?: unknown }>(walletResult.value.body);
        wallet = "available";
        if (typeof data?.credits === "number" && Number.isFinite(data.credits)) credits = data.credits;
      } else if (walletResult.reason instanceof NenaProviderError && walletResult.reason.reason === "access_denied") wallet = "denied";
      let sender: NenaConnectionStatus["sender"] = "unavailable";
      let senderLabel: string | null = null;
      if (senderResult.status === "fulfilled") {
        const found = resolveNenaSenderId(senderResult.value);
        sender = found ? "available" : "not_assigned";
        senderLabel = found?.label ?? found?.value ?? null;
      } else if (senderResult.reason instanceof NenaProviderError && senderResult.reason.reason === "access_denied") sender = "denied";
      return { configured: true, wallet, credits, sender, senderLabel };
    },

    async send(to: string | string[], message: string): Promise<NenaDeliveryResult> {
      const recipients = Array.isArray(to) ? to : [to];
      const cleanMessage = message.trim();
      if (!recipients.length) throw new NenaProviderError("Choose at least one recipient.", undefined, "empty_recipients");
      if (recipients.length > 50) throw new NenaProviderError("Nena accepts at most 50 recipients per request.", undefined, "recipient_limit");
      if (!cleanMessage) throw new NenaProviderError("SMS message cannot be empty.", undefined, "empty_message");
      const sender = await senderForRequiredId();
      const result = await request<unknown>("/sms/send", {
        method: "POST",
        body: JSON.stringify({ sender_id: sender.id, to: recipients.length === 1 ? recipients[0] : recipients, message: cleanMessage }),
      });
      const data = getData<{ status?: unknown; accepted?: unknown; skipped?: unknown; id?: unknown }>(result.body);
      if (data?.status !== "queued") throw new NenaProviderError("Nena did not queue the SMS. No delivery is claimed.", result.status, "not_queued");
      const accepted = Array.isArray(data.accepted) ? data.accepted.filter((item): item is string => typeof item === "string") : [];
      const expected = new Set(recipients.map(canonicalNenaNumber));
      if (accepted.some(number => !expected.has(canonicalNenaNumber(number)))) {
        throw new NenaProviderError("Nena returned an unexpected recipient in its send response.", result.status, "invalid_response");
      }
      if (!accepted.length) throw new NenaProviderError("Nena accepted no recipients. No message was confirmed as queued.", result.status, "no_recipients_accepted");
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : Math.max(0, recipients.length - accepted.length);
      return { status: "queued", accepted, skippedCount, providerMessageId: typeof data.id === "string" ? data.id : undefined };
    },
  };
}

export const nenaBaseUrl = NENA_BASE_URL;
export const nenaRequiredSender = REQUIRED_SENDER;
