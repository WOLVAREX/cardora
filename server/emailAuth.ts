import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, SESSION_LIFETIME_MS, AUTH_RATE_WINDOW_MS } from "@shared/const";
import { sessions, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const rateBuckets = new Map<string, { count: number; expiresAt: number }>();

function scryptAsync(password: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEY_BYTES);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || extra !== undefined || !saltText || !keyText) return false;
  const cost = Number(n), blockSize = Number(r), parallelism = Number(p);
  if (cost !== SCRYPT_N || blockSize !== SCRYPT_R || parallelism !== SCRYPT_P) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_BYTES) return false;
    const actual = await scryptAsync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function digestSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isEmailCollision(email: string, existing: Array<{ email: string | null; emailAuthEmail: string | null }>): boolean {
  const normalized = normalizeEmail(email);
  return existing.some(row =>
    (row.email !== null && normalizeEmail(row.email) === normalized) ||
    (row.emailAuthEmail !== null && normalizeEmail(row.emailAuthEmail) === normalized)
  );
}

export function enforceAuthRateLimit(req: Request, email: string, operation: "signup" | "signin", now = Date.now()): void {
  if (rateBuckets.size > 4_000) {
    for (const [key, bucket] of rateBuckets) if (bucket.expiresAt <= now) rateBuckets.delete(key);
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const normalized = normalizeEmail(email) || "invalid-email";
  const checks: Array<[string, number]> = [
    [`${operation}:ip:${ip}`, 40],
    [`${operation}:email:${normalized}`, 10],
  ];
  for (const [key, limit] of checks) {
    const bucket = rateBuckets.get(key);
    if (bucket && bucket.expiresAt > now && bucket.count >= limit) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please wait a little while and try again." });
    }
  }
  for (const [key] of checks) {
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.expiresAt <= now) rateBuckets.set(key, { count: 1, expiresAt: now + AUTH_RATE_WINDOW_MS });
    else bucket.count += 1;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  return parseCookieHeader(req.headers.cookie ?? "")[name];
}

async function insertSession(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora authentication is temporarily unavailable." });
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(sessions).values({ userId, tokenHash: digestSessionToken(token), expiresAt });
  return { token, expiresAt };
}

function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date) {
  res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    expires: expiresAt,
    maxAge: SESSION_LIFETIME_MS,
  });
}

export async function signUpWithEmail(input: { name: string; email: string; password: string }, req: Request, res: Response): Promise<User> {
  const normalizedEmail = normalizeEmail(input.email);
  enforceAuthRateLimit(req, normalizedEmail, "signup");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora authentication is temporarily unavailable." });

  const matchingRows = await db.select({ email: users.email, emailAuthEmail: users.emailAuthEmail })
    .from(users)
    .where(or(sql`LOWER(${users.email}) = ${normalizedEmail}`, eq(users.emailAuthEmail, normalizedEmail)))
    .limit(10);
  if (isEmailCollision(normalizedEmail, matchingRows)) {
    throw new TRPCError({ code: "CONFLICT", message: "This email cannot be claimed through sign-up. If it belongs to an existing Cardora account, an operator must migrate that account separately." });
  }

  const passwordHash = await hashPassword(input.password);
  let newId: number;
  try {
    const [inserted] = await db.insert(users).values({
      openId: null,
      name: input.name.trim(),
      email: normalizedEmail,
      emailAuthEmail: normalizedEmail,
      passwordHash,
      loginMethod: "email",
      role: "user",
      lastSignedIn: new Date(),
    }).returning({ id: users.id });
    newId = inserted.id;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists. Sign in or contact the operator if this is a legacy account." });
    }
    throw error;
  }

  const [user] = await db.select().from(users).where(eq(users.id, newId)).limit(1);
  if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The new account could not be loaded." });
  await revokeCurrentSession(req);
  const { token, expiresAt } = await insertSession(user.id);
  setSessionCookie(req, res, token, expiresAt);
  return user;
}

const dummyPasswordHashPromise = hashPassword(randomBytes(32).toString("hex"));

export async function signInWithEmail(input: { email: string; password: string }, req: Request, res: Response): Promise<User> {
  const normalizedEmail = normalizeEmail(input.email);
  enforceAuthRateLimit(req, normalizedEmail, "signin");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora authentication is temporarily unavailable." });
  const [user] = await db.select().from(users).where(eq(users.emailAuthEmail, normalizedEmail)).limit(1);
  const encodedHash = user?.passwordHash || await dummyPasswordHashPromise;
  const matches = await verifyPassword(input.password, encodedHash);
  if (!user || !user.passwordHash || !matches) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "The email or password is incorrect." });
  }

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  await revokeCurrentSession(req);
  const { token, expiresAt } = await insertSession(user.id);
  setSessionCookie(req, res, token, expiresAt);
  return { ...user, lastSignedIn: new Date() };
}

export async function getUserFromSession(req: Request): Promise<User | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const db = await getDb();
  if (!db) return null;
  const [session] = await db.select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, digestSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function revokeCurrentSession(req: Request): Promise<void> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, digestSessionToken(token)));
}

export async function signOut(req: Request, res: Response): Promise<void> {
  await revokeCurrentSession(req);
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: 0 });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    ["23505", "ER_DUP_ENTRY", "SQLITE_CONSTRAINT_UNIQUE"].includes((error as { code?: string }).code ?? "");
}
