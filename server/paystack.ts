import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PAYSTACK_API_BASE = "https://api.paystack.co";
const CHECKOUT_HOST = "checkout.paystack.com";
const REQUEST_TIMEOUT_MS = 15_000;

export interface PaystackConfig {
  /** Server-only. Never serialize this object to a browser response. */
  secretKey: string;
  appUrl: string;
  callbackUrl: string;
}

export interface PaystackInitResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackTransaction {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string | null;
  paid_at?: string | null;
  customer?: { email?: string | null; customer_code?: string | null } | null;
}

export interface PaystackClient {
  initializeTransaction(input: {
    email: string;
    amount: number;
    currency: "KES";
    reference: string;
    callbackUrl: string;
    metadata: string;
  }): Promise<PaystackInitResult>;
  verifyTransaction(reference: string): Promise<PaystackTransaction>;
}

export class PaystackApiError extends Error {
  constructor() {
    super("Paystack could not complete the request. Please try again shortly.");
    this.name = "PaystackApiError";
  }
}

/** Checkout is deliberately unavailable outside the production runtime. */
export function getPaystackConfig(env: NodeJS.ProcessEnv = process.env): PaystackConfig | null {
  if (env.NODE_ENV !== "production") return null;
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  const appUrlText = env.CARDORA_APP_URL?.trim();
  if (!secretKey || !appUrlText) return null;

  try {
    const appUrl = new URL(appUrlText);
    if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) return null;
    const origin = appUrl.origin;
    const allowedOrigins = env.CARDORA_PUBLIC_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean);
    if (allowedOrigins?.length) {
      const includesOrigin = allowedOrigins.some(value => {
        try { return new URL(value).origin === origin; }
        catch { return false; }
      });
      if (!includesOrigin) return null;
    }
    return { secretKey, appUrl: origin, callbackUrl: new URL("/billing/return", origin).toString() };
  } catch {
    return null;
  }
}

export function isValidPaystackAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === CHECKOUT_HOST && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function createCardoraPaymentReference(): string {
  return `CARDORA${randomBytes(16).toString("hex")}`;
}

export function isCardoraPaymentReference(value: string): boolean {
  return /^CARDORA[0-9a-f]{32}$/i.test(value);
}

export function verifyPaystackWebhookSignature(rawBody: Buffer | Uint8Array, signature: string | undefined, secretKey: string): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifiedTransactionMatches(expected: {
  reference: string;
  amountMinor: number;
  currency: string;
}, actual: PaystackTransaction): boolean {
  return actual.reference === expected.reference
    && Number.isSafeInteger(actual.amount)
    && actual.amount === expected.amountMinor
    && actual.currency.trim().toUpperCase() === expected.currency.trim().toUpperCase();
}

/** Add one calendar billing term, clamping month-end/leap-day dates instead of overflowing. */
export function addBillingInterval(start: Date, interval: "monthly" | "yearly"): Date {
  if (!Number.isFinite(start.getTime())) throw new RangeError("A valid billing start date is required.");
  const targetMonthIndex = start.getUTCMonth() + (interval === "monthly" ? 1 : 12);
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    day,
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
}

export function createPaystackClient(config: PaystackConfig, fetcher: typeof fetch = fetch): PaystackClient {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(new URL(path, PAYSTACK_API_BASE), {
        ...init,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new PaystackApiError();
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PaystackApiError(); }
    if (!response.ok || !payload || typeof payload !== "object" || (payload as { status?: unknown }).status !== true || !("data" in payload)) {
      throw new PaystackApiError();
    }
    return (payload as { data: T }).data;
  }

  return {
    async initializeTransaction(input) {
      const data = await request<{ authorization_url?: unknown; access_code?: unknown; reference?: unknown }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amount,
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          channels: ["card", "mobile_money"],
          metadata: input.metadata,
        }),
      });
      if (data.reference !== input.reference || typeof data.access_code !== "string" || !data.access_code
        || typeof data.authorization_url !== "string" || !isValidPaystackAuthorizationUrl(data.authorization_url)) {
        throw new PaystackApiError();
      }
      return { authorizationUrl: data.authorization_url, accessCode: data.access_code, reference: data.reference };
    },
    async verifyTransaction(reference) {
      const data = await request<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
      if (!data || typeof data.status !== "string" || typeof data.reference !== "string" || !Number.isSafeInteger(data.amount) || typeof data.currency !== "string") {
        throw new PaystackApiError();
      }
      return data;
    },
  };
}
