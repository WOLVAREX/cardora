import { and, eq, gte } from "drizzle-orm";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { gmailConnections, gmailOauthStates, users } from "../drizzle/schema";
import { createGoogleConsentUrl, decryptRefreshToken, digestOAuthState, encryptRefreshToken, exchangeGoogleCode, fetchGoogleIdentity, googleOAuthConfig, revokeGoogleToken } from "./cardoraGoogle";
import { getDb } from "./db";

export const GMAIL_STATE_COOKIE = "cardora_gmail_oauth_state";
const COOKIE_PATH = "/api/cardora/google/callback";

function queryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function clearStateCookie(res: Response) {
  res.clearCookie(GMAIL_STATE_COOKIE, { httpOnly: true, path: COOKIE_PATH, secure: true, sameSite: "none" });
}

function redirectError(res: Response, reason: string) {
  res.redirect(302, `/?gmail=error&reason=${encodeURIComponent(reason)}`);
}

export function registerCardoraGoogleOAuthRoutes(app: Express) {
  app.get("/api/cardora/google/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    const code = queryString(req, "code");
    const state = queryString(req, "state");
    const googleError = queryString(req, "error");
    const browserState = parseCookieHeader(req.headers.cookie ?? "")[GMAIL_STATE_COOKIE];
    clearStateCookie(res);
    if (googleError === "access_denied") { res.redirect(302, "/?gmail=cancelled"); return; }
    if (!code || !state || !browserState || state !== browserState) { res.status(403).send("The Gmail connection state is invalid. Start the connection again."); return; }

    try {
      const db = await getDb();
      if (!db) throw new Error("database_unavailable");
      const now = new Date();
      const pending = await db.transaction(async tx => {
        const [row] = await tx.select().from(gmailOauthStates).where(and(
          eq(gmailOauthStates.stateDigest, digestOAuthState(state)), gte(gmailOauthStates.expiresAt, now),
        )).limit(1).for("update");
        if (!row) return null;
        await tx.delete(gmailOauthStates).where(eq(gmailOauthStates.id, row.id));
        return row;
      });
      if (!pending) { res.status(403).send("The Gmail connection expired. Start the connection again."); return; }

      const config = googleOAuthConfig();
      if (!config.configured) { redirectError(res, "not_configured"); return; }
      const tokens = await exchangeGoogleCode(code, pending.codeVerifier, config);
      if (!tokens.refreshToken) { redirectError(res, "refresh_token_missing"); return; }
      const identity = await fetchGoogleIdentity(tokens.accessToken);
      const [profile] = await db.select({ notificationEmail: users.notificationEmail, email: users.email }).from(users).where(eq(users.id, pending.ownerId)).limit(1);
      const expectedEmail = profile?.notificationEmail ?? (profile?.email?.toLowerCase().endsWith("@gmail.com") ? profile.email : null);
      if (!expectedEmail || identity.email.toLowerCase() !== expectedEmail.toLowerCase()) {
        await revokeGoogleToken(tokens.refreshToken);
        redirectError(res, "gmail_mismatch");
        return;
      }
      const encrypted = encryptRefreshToken(tokens.refreshToken, config.encryptionKey);
      await db.insert(gmailConnections).values({
        ownerId: pending.ownerId,
        gmailAddress: identity.email,
        ...encrypted,
        grantedScopes: tokens.scope,
      }).onDuplicateKeyUpdate({ set: { gmailAddress: identity.email, ...encrypted, grantedScopes: tokens.scope, updatedAt: new Date() } });
      res.redirect(302, "/?gmail=connected");
    } catch (error) {
      console.error("[Cardora Gmail OAuth] Callback failed", error instanceof Error ? error.name : "unknown");
      redirectError(res, "connection_failed");
    }
  });
}

export async function disconnectOwnerGmail(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Cardora's database is not available right now.");
  const [connection] = await db.select().from(gmailConnections).where(eq(gmailConnections.ownerId, ownerId)).limit(1);
  if (!connection) return false;
  try { await revokeGoogleToken(decryptRefreshToken(connection)); } catch { /* remove local credentials even when remote revocation is unavailable */ }
  await db.delete(gmailConnections).where(eq(gmailConnections.ownerId, ownerId));
  return true;
}
