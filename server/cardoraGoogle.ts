import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"] as const;

export class GoogleIntegrationError extends Error {
  constructor(message: string, readonly reason = "google_error") { super(message); this.name = "GoogleIntegrationError"; }
}

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "";
  const encryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  let redirectValid = false;
  try {
    const redirect = new URL(redirectUri);
    const secureOrigin = redirect.protocol === "https:" || ((redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1") && redirect.protocol === "http:");
    redirectValid = secureOrigin && redirect.pathname === "/api/cardora/google/callback" && !redirect.search && !redirect.hash && !redirect.username && !redirect.password;
  } catch { /* exact public callback is required */ }
  const encryptionKeyValid = encryptionKey.length > 0 && (/^[a-f0-9]{64}$/i.test(encryptionKey) ? Buffer.from(encryptionKey, "hex") : Buffer.from(encryptionKey, "base64url")).length === 32;
  return { clientId, clientSecret, redirectUri, encryptionKey, configured: Boolean(clientId && clientSecret && redirectValid && encryptionKeyValid) };
}

export function createGoogleConsentUrl(args: { state: string; codeChallenge: string; config?: ReturnType<typeof googleOAuthConfig> }) {
  const config = args.config ?? googleOAuthConfig();
  if (!config.clientId || !config.redirectUri) throw new GoogleIntegrationError("Google Gmail connection is not configured on this server.", "not_configured");
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function encryptionKey(raw = googleOAuthConfig().encryptionKey) {
  const fromHex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : null;
  const fromBase64 = fromHex ?? Buffer.from(raw, "base64url");
  if (fromBase64.length !== 32) throw new GoogleIntegrationError("Gmail token encryption is not configured with a 32-byte key.", "encryption_not_configured");
  return fromBase64;
}

export function encryptRefreshToken(token: string, rawKey?: string) {
  if (!token) throw new GoogleIntegrationError("Google did not return a refresh token.", "refresh_token_missing");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encryptedRefreshToken: ciphertext.toString("base64url"), tokenIv: iv.toString("base64url"), tokenTag: cipher.getAuthTag().toString("base64url") };
}

export function decryptRefreshToken(record: { encryptedRefreshToken: string; tokenIv: string; tokenTag: string }, rawKey?: string) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(rawKey), Buffer.from(record.tokenIv, "base64url"));
    decipher.setAuthTag(Buffer.from(record.tokenTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(record.encryptedRefreshToken, "base64url")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof GoogleIntegrationError) throw error;
    throw new GoogleIntegrationError("The saved Gmail connection could not be decrypted. Reconnect the account.", "token_decryption_failed");
  }
}

export function digestOAuthState(state: string) { return createHash("sha256").update(state).digest("hex"); }
export function createCodeVerifier() { return randomBytes(32).toString("base64url"); }
export function createCodeChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try { const value: unknown = await response.json(); return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}

export async function exchangeGoogleCode(code: string, codeVerifier: string, config = googleOAuthConfig(), fetcher: typeof fetch = fetch) {
  if (!config.configured) throw new GoogleIntegrationError("Google Gmail connection is not configured on this server.", "not_configured");
  const body = new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier });
  let response: Response;
  try { response = await fetcher(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(15000) }); }
  catch { throw new GoogleIntegrationError("Google could not be reached to finish the account connection.", "network_error"); }
  const data = await readJson(response);
  if (!response.ok || typeof data.access_token !== "string") throw new GoogleIntegrationError("Google could not complete the Gmail authorization. Check the production OAuth client and callback configuration.", "token_exchange_failed");
  return { accessToken: data.access_token, refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null, scope: typeof data.scope === "string" ? data.scope : "" };
}

export async function fetchGoogleIdentity(accessToken: string, fetcher: typeof fetch = fetch) {
  let response: Response;
  try { response = await fetcher(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new GoogleIntegrationError("Google account identity could not be verified.", "identity_unavailable"); }
  const data = await readJson(response);
  if (!response.ok || typeof data.email !== "string" || data.email_verified !== true || typeof data.sub !== "string") throw new GoogleIntegrationError("Google did not provide a verified Gmail identity.", "identity_unverified");
  return { email: data.email, subject: data.sub };
}

export async function refreshGoogleAccessToken(refreshToken: string, config = googleOAuthConfig(), fetcher: typeof fetch = fetch) {
  if (!config.configured) throw new GoogleIntegrationError("Google Gmail connection is not configured on this server.", "not_configured");
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  let response: Response;
  try { response = await fetcher(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(15000) }); }
  catch { throw new GoogleIntegrationError("Google could not be reached to refresh Gmail access.", "network_error"); }
  const data = await readJson(response);
  if (!response.ok || typeof data.access_token !== "string") throw new GoogleIntegrationError("Google Gmail access needs to be reconnected.", "refresh_failed");
  return data.access_token;
}

export function gmailRawMessage(to: string, subject: string, body: string) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) || /[\r\n]/.test(to)) throw new GoogleIntegrationError("Recipient email address is invalid.", "recipient_invalid");
  if (/[\r\n]/.test(subject)) throw new GoogleIntegrationError("Email subject contains unsupported line breaks.", "subject_invalid");
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body.replace(/\r\n|\r|\n/g, "\r\n"),
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export async function sendGmailMessage(accessToken: string, to: string, subject: string, body: string, fetcher: typeof fetch = fetch) {
  const raw = gmailRawMessage(to, subject, body);
  let response: Response;
  try { response = await fetcher(GMAIL_SEND_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ raw }), signal: AbortSignal.timeout(20000) }); }
  catch { throw new GoogleIntegrationError("Google did not confirm whether this email was accepted. Check Gmail sent mail before retrying.", "send_outcome_uncertain"); }
  const data = await readJson(response);
  if (!response.ok || typeof data.id !== "string") throw new GoogleIntegrationError("Gmail did not confirm this email as accepted.", "send_failed");
  return { id: data.id };
}

export async function revokeGoogleToken(token: string, fetcher: typeof fetch = fetch) {
  try {
    await fetcher(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) });
  } catch { /* local disconnect still removes the application's stored credential */ }
}
