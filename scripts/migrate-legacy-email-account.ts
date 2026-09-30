import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { StringDecoder } from "node:string_decoder";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { hashPassword, normalizeEmail } from "../server/emailAuth";
import { users } from "../drizzle/schema";

async function askSecret(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Password entry requires an interactive terminal so the password can be hidden.");
  }
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let value = "";
    const wasRaw = input.isRaw;
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    const finish = (error?: Error) => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw ?? false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        const code = character.charCodeAt(0);
        if (code === 3) return finish(new Error("Cancelled."));
        if (code === 10 || code === 13) return finish();
        if (code === 8 || code === 127) {
          if (value.length) {
            value = Array.from(value).slice(0, -1).join("");
            process.stdout.write("\b \b");
          }
        } else if (code >= 32) {
          value += character;
          process.stdout.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at the intended production database.");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable; no account was changed.");

  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write("Cardora legacy email-login migration\nThis changes one existing account row only. It does not run automatically.\n\n");
    const idText = (await prompts.question("Exact legacy user ID: ")).trim();
    if (!/^\d+$/.test(idText) || Number(idText) < 1) throw new Error("Enter a positive numeric user ID.");
    const userId = Number(idText);
    const email = normalizeEmail(await prompts.question("Email already on that legacy account: "));
    const [account] = await db.select({
      id: users.id,
      openId: users.openId,
      email: users.email,
      emailAuthEmail: users.emailAuthEmail,
      passwordHash: users.passwordHash,
    }).from(users).where(eq(users.id, userId)).limit(1);

    if (!account) throw new Error("No account exists with that exact user ID.");
    if (!account.openId) throw new Error("That row is not a legacy OAuth-linked account; it was not changed.");
    if (account.emailAuthEmail || account.passwordHash) throw new Error("That account already has email credentials; it was not changed.");
    if (!account.email || normalizeEmail(account.email) !== email) throw new Error("The supplied email does not exactly match the legacy account's existing email; it was not changed.");

    const possibleMatches = await db.select({ id: users.id })
      .from(users)
      .where(or(sql`LOWER(${users.email}) = ${email}`, eq(users.emailAuthEmail, email)))
      .limit(2);
    if (possibleMatches.length !== 1 || possibleMatches[0]?.id !== userId) {
      throw new Error("The email matches zero or multiple account rows; resolve the ambiguity before migration.");
    }

    prompts.close();
    const password = await askSecret("New password (minimum 12 characters): ");
    const confirmation = await askSecret("Confirm new password: ");
    if (password.length < 12 || password.length > 1024) throw new Error("Password must contain 12–1024 characters.");
    if (password !== confirmation) throw new Error("Passwords do not match.");

    const confirm = createInterface({ input: process.stdin, output: process.stdout });
    const approval = (await confirm.question(`Type MIGRATE-${userId} to attach email login to this account: `)).trim();
    confirm.close();
    if (approval !== `MIGRATE-${userId}`) throw new Error("Confirmation did not match; no account was changed.");

    const passwordHash = await hashPassword(password);
    const result = await db.update(users)
      .set({ emailAuthEmail: email, passwordHash })
      .where(and(eq(users.id, userId), eq(users.openId, account.openId), sql`${users.emailAuthEmail} IS NULL`, sql`${users.passwordHash} IS NULL`));

    if (result[0].affectedRows !== 1) throw new Error("The account changed while migration was in progress; no credentials were attached.");
    process.stdout.write(`Email/password access attached to legacy user ${userId}. Existing role, ID, email, profile, collections and contacts were preserved.\n`);
  } finally {
    prompts.close();
    await db.$client.end();
  }
}

void main().catch(error => {
  process.stderr.write(`Legacy migration stopped: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
