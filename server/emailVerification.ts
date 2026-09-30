import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { emailVerifications, sessions, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { COOKIE_NAME, SESSION_LIFETIME_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { digestSessionToken, revokeCurrentSession } from "./emailAuth";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const sendBuckets = new Map<number, { sentAt: number[] }>;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function mailConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Cardora";
  if (!apiKey || !senderEmail) return null;
  return { apiKey, senderEmail, senderName };
}

export function emailDeliveryConfigured() { return Boolean(mailConfig()); }

export async function sendEmailVerification(user: User): Promise<void> {
  const config = mailConfig();
  if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email verification is not configured yet. Please contact Cardora support." });
  if (!user.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This account has no email address to verify." });
  const now = Date.now();
  const bucket = sendBuckets.get(user.id) ?? { sentAt: [] };
  bucket.sentAt = bucket.sentAt.filter(at => now - at < 60 * 60 * 1000);
  if (bucket.sentAt.length && now - bucket.sentAt[bucket.sentAt.length - 1] < 60_000) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait one minute before requesting another verification email." });
  }
  if (bucket.sentAt.length >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You have reached the verification email limit. Try again later." });
  bucket.sentAt.push(now);
  sendBuckets.set(user.id, bucket);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.delete(emailVerifications).where(eq(emailVerifications.ownerId, user.id));
  await db.insert(emailVerifications).values({ ownerId: user.id, tokenHash: hashToken(token), expiresAt });
  const origin = process.env.CARDORA_PUBLIC_ORIGINS?.split(",")[0]?.trim() || process.env.APP_URL || "http://localhost:3000";
  const link = `${origin.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: config.senderName, email: config.senderEmail }, to: [{ email: user.email }], subject: "Verify your Cardora email", textContent: `Finish setting up your Cardora account by verifying your email address:\n\n${link}\n\nThis link expires in 24 hours. If you did not create this account, ignore this email.` }),
  });
  if (!response.ok) {
    await db.delete(emailVerifications).where(and(eq(emailVerifications.ownerId, user.id), eq(emailVerifications.tokenHash, hashToken(token))));
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "We could not send the verification email. Check the mail configuration or try again later." });
  }
}

export async function verifyEmailToken(token: string, req: Request, res: Response): Promise<User> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw new TRPCError({ code: "BAD_REQUEST", message: "This verification link is invalid or expired." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
  const verifiedUser = await db.transaction(async tx => {
    const [challenge] = await tx.select().from(emailVerifications).where(and(eq(emailVerifications.tokenHash, hashToken(token)), gt(emailVerifications.expiresAt, new Date()))).limit(1).for("update");
    if (!challenge) return null;
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, challenge.ownerId));
    await tx.delete(emailVerifications).where(eq(emailVerifications.id, challenge.id));
    const [user] = await tx.select().from(users).where(eq(users.id, challenge.ownerId)).limit(1);
    return user ?? null;
  });
  if (!verifiedUser) throw new TRPCError({ code: "BAD_REQUEST", message: "This verification link is invalid or expired." });
  await revokeCurrentSession(req);
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(sessions).values({ userId: verifiedUser.id, tokenHash: digestSessionToken(sessionToken), expiresAt });
  res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), expires: expiresAt, maxAge: SESSION_LIFETIME_MS });
  return verifiedUser;
}
