import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { campaigns, contacts, collections, gmailConnections, gmailOauthStates, ownerAlerts, phoneVerifications, users } from "../drizzle/schema";
import { buildVcf, campaignRecipientSnapshotHash, campaignReviewHash, CardoraValidationError, isCountryAllowed, isKenyaSmsEligible, isSupportedCountryCode, normalizePhone, normalizeSlug, validateCanonicalShareUrl } from "./cardora";
import { createAccountLimitAlert, createCapacityAlert, listOwnerCollections, publicCollectionBySlug } from "./cardoraDb";
import { getDb } from "./db";
import { getOwnerEntitlement, listAvailablePlans } from "./subscriptionService";
import { onboardingProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { canonicalNenaNumber, createNenaClient, NenaProviderError } from "./cardoraNena";
import { createCodeChallenge, createCodeVerifier, createGoogleConsentUrl, decryptRefreshToken, digestOAuthState, GoogleIntegrationError, googleOAuthConfig, refreshGoogleAccessToken, sendGmailMessage } from "./cardoraGoogle";
import { disconnectOwnerGmail, GMAIL_STATE_COOKIE } from "./cardoraOAuth";

function requireDb() {
  return getDb().then(db => {
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
    return db;
  });
}

const slugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const canonicalSchema = z.string().url().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
}, "Use a public HTTPS link (localhost is allowed during development).");

export const cardoraRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [myCollections, alerts, profile, gmail, subscription] = await Promise.all([
      listOwnerCollections(ctx.user.id),
      db.select().from(ownerAlerts).where(eq(ownerAlerts.ownerId, ctx.user.id)).orderBy(desc(ownerAlerts.createdAt)).limit(8),
      db.select({ notificationEmail: users.notificationEmail, phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt })
        .from(users).where(eq(users.id, ctx.user.id)).limit(1),
      db.select({ gmailAddress: gmailConnections.gmailAddress }).from(gmailConnections).where(eq(gmailConnections.ownerId, ctx.user.id)).limit(1),
      getOwnerEntitlement(db, ctx.user.id),
    ]);
    const current = profile[0] ?? { notificationEmail: null, phoneE164: null, phoneCountryCode: null, phoneVerifiedAt: null };
    const ownerGmail = current.notificationEmail ?? (ctx.user.email?.toLowerCase().endsWith("@gmail.com") ? ctx.user.email : null);
    return {
      collections: myCollections,
      alerts,
      subscription,
      profile: {
        email: ctx.user.email,
        notificationEmail: ownerGmail,
        phoneE164: current.phoneE164,
        phoneCountryCode: current.phoneCountryCode,
        phoneVerifiedAt: current.phoneVerifiedAt,
        smsEligible: isKenyaSmsEligible(current),
        gmailConnected: Boolean(gmail[0] && ownerGmail && gmail[0].gmailAddress.toLowerCase() === ownerGmail.toLowerCase()),
        gmailAddress: gmail[0]?.gmailAddress ?? null,
        gmailConfigured: googleOAuthConfig().configured,
      },
      totalContacts: subscription.usage.acceptedContacts,
      openCollections: myCollections.filter(item => item.status === "open").length,
    };
  }),

  subscription: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const [entitlement, availablePlans] = await Promise.all([
        getOwnerEntitlement(db, ctx.user.id),
        listAvailablePlans(db),
      ]);
      return { ...entitlement, availablePlans };
    }),
  }),

  collection: router({
    create: protectedProcedure.input(z.object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().min(1).max(500),
      slug: slugSchema,
      canonicalUrl: canonicalSchema,
      allowedCountryCodes: z.array(z.string().regex(/^[A-Z]{2}$/).refine(isSupportedCountryCode, "Choose a supported country.")).min(1).max(250),
      contactLimit: z.number().int().min(1).max(100000),
    }).superRefine((input, issue) => {
      try {
        const path = new URL(input.canonicalUrl).pathname.replace(/\/+$/, "");
        if (path !== `/c/${input.slug}`) issue.addIssue({ code: "custom", path: ["canonicalUrl"], message: "The share URL must use this collection's /c/<link-name> path." });
      } catch { /* canonicalSchema reports invalid URLs */ }
    })).mutation(async ({ ctx, input }) => {
      try {
        validateCanonicalShareUrl({
          canonicalUrl: input.canonicalUrl,
          slug: input.slug,
          requestOrigin: ctx.req.get("origin"),
          configuredOrigins: process.env.CARDORA_PUBLIC_ORIGINS,
        });
      } catch (error) {
        if (error instanceof CardoraValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        throw error;
      }
      const db = await requireDb();
      const [ownerProfile] = await db.select({ notificationEmail: users.notificationEmail, phoneE164: users.phoneE164 }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const notificationEmail = ownerProfile?.notificationEmail ?? (ctx.user.email?.toLowerCase().endsWith("@gmail.com") ? ctx.user.email : null);
      if (!notificationEmail) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add a Gmail address in account settings before creating a collection." });
      if (!ownerProfile?.phoneE164) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add a phone number to your account before creating a collection." });
      try { normalizePhone(ownerProfile.phoneE164); }
      catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save a valid international phone number before creating a collection." }); }
      const allowedCountryCodes = Array.from(new Set(input.allowedCountryCodes));
      if (allowedCountryCodes.length !== input.allowedCountryCodes.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Remove repeated countries from the allow-list." });
      }
      let collectionId: number | null;
      try {
        collectionId = await db.transaction(async tx => {
          const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
          if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found." });
          const entitlement = await getOwnerEntitlement(tx, ctx.user.id);
          if (!entitlement.usage.canCreateCollection) return null;
          const [inserted] = await tx.insert(collections).values({
            ownerId: ctx.user.id,
            title: input.title,
            description: input.description,
            slug: normalizeSlug(input.slug),
            canonicalUrl: input.canonicalUrl,
            allowedCountryCodes,
            contactLimit: input.contactLimit,
            usedSlots: 0,
            status: "open",
          }).returning({ id: collections.id });
          return inserted.id;
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (String(error).includes("cardora_collections_slug_unique") || String(error).includes("ER_DUP_ENTRY") || (typeof error === "object" && error !== null && "code" in error && error.code === "23505")) {
          throw new TRPCError({ code: "CONFLICT", message: "That link name is already in use. Choose another one." });
        }
        throw error;
      }
      if (collectionId === null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "You have reached your plan's collection-link limit. Change your plan or ask an administrator to increase it before creating another link." });
      const [created] = await db.select().from(collections).where(eq(collections.id, collectionId)).limit(1);
      return created;
    }),
    publicDetail: publicProcedure.input(z.object({ slug: slugSchema })).query(async ({ ctx, input }) => {
      ctx.res.setHeader("Cache-Control", "private, no-store");
      const collection = await publicCollectionBySlug(input.slug);
      if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "This Cardora collection link could not be found." });
      const entitlement = await getOwnerEntitlement(await requireDb(), collection.ownerId);
      const collectionAtCapacity = collection.status === "full" || collection.status === "paused" || collection.usedSlots >= collection.contactLimit;
      const accountAtCapacity = !entitlement.usage.canAcceptContact;
      const atCapacity = collectionAtCapacity || accountAtCapacity;
      return {
        id: collection.id,
        slug: collection.slug,
        title: collection.title,
        description: collection.description,
        canonicalUrl: collection.canonicalUrl,
        allowedCountryCodes: collection.allowedCountryCodes,
        contactLimit: collection.contactLimit,
        usedSlots: collection.usedSlots,
        remaining: Math.max(0, collection.contactLimit - collection.usedSlots),
        status: atCapacity ? "full" as const : "open" as const,
        fullReason: collectionAtCapacity ? "collection" as const : accountAtCapacity ? "account" as const : null,
      };
    }),
    submit: publicProcedure.input(z.object({
      slug: slugSchema,
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(6).max(40),
      email: z.string().trim().email().max(320).optional().or(z.literal("")),
      emailOptIn: z.boolean().default(false),
      smsOptIn: z.boolean().default(false),
      consent: z.literal(true),
    }).superRefine((input, issue) => {
      if (input.emailOptIn && !input.email) issue.addIssue({ code: "custom", path: ["email"], message: "Add an email address to opt into email updates." });
    })).mutation(async ({ input }) => {
      const db = await requireDb();
      let phone: ReturnType<typeof normalizePhone>;
      try { phone = normalizePhone(input.phone); }
      catch (error) {
        if (error instanceof CardoraValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        throw error;
      }
      if (input.smsOptIn && phone.countryCode !== "KE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SMS updates are available only for Kenyan (+254) phone numbers." });
      }
      const collection = await publicCollectionBySlug(input.slug);
      if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "This Cardora collection link could not be found." });
      if (!isCountryAllowed(phone.countryCode, collection.allowedCountryCodes)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `This link is not accepting contacts with the ${phone.countryCode} country calling code.` });
      }
      const outcome = await db.transaction(async tx => {
        const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, collection.ownerId)).limit(1).for("update");
        if (!owner) return { kind: "missing" as const };
        const locked = await tx.select().from(collections).where(eq(collections.id, collection.id)).limit(1).for("update");
        const current = locked[0];
        if (!current) return { kind: "missing" as const };
        if (current.status !== "open" || current.usedSlots >= current.contactLimit) {
          if (current.status === "open") {
            await tx.update(collections).set({ status: "full" }).where(eq(collections.id, current.id));
            await createCapacityAlert(tx, current.ownerId, current.id, current.title);
          }
          return { kind: "full" as const };
        }
        const duplicate = await tx.select({ id: contacts.id }).from(contacts).where(and(
          eq(contacts.collectionId, current.id), eq(contacts.phoneE164, phone.phoneE164),
        )).limit(1);
        if (duplicate.length) return { kind: "duplicate" as const };
        const entitlement = await getOwnerEntitlement(tx, current.ownerId);
        if (!entitlement.usage.canAcceptContact) {
          await createAccountLimitAlert(tx, current.ownerId, current.id, entitlement.plan.name, entitlement.plan.contactLimit);
          return { kind: "account_full" as const };
        }
        const unsubscribeToken = randomUUID().replace(/-/g, "");
        await tx.insert(contacts).values({
          collectionId: current.id,
          name: input.name,
          phoneE164: phone.phoneE164,
          countryCode: phone.countryCode,
          email: input.emailOptIn ? (input.email || null) : null,
          emailOptIn: input.emailOptIn,
          smsOptIn: input.smsOptIn,
          consentVersion: "2026-09",
          unsubscribeToken,
          status: "accepted",
        });
        const nextUsed = current.usedSlots + 1;
        const reached = nextUsed >= current.contactLimit;
        const accountLimitReached = entitlement.usage.acceptedContacts + 1 >= entitlement.plan.contactLimit;
        await tx.update(collections).set({ usedSlots: nextUsed, status: reached ? "full" : "open" }).where(eq(collections.id, current.id));
        if (reached) await createCapacityAlert(tx, current.ownerId, current.id, current.title);
        if (accountLimitReached) await createAccountLimitAlert(tx, current.ownerId, current.id, entitlement.plan.name, entitlement.plan.contactLimit);
        return { kind: "accepted" as const, reached, accountLimitReached, unsubscribeToken };
      });
      if (outcome.kind === "full") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This VCF link is at capacity and is no longer accepting contacts." });
      if (outcome.kind === "account_full") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This collection owner has reached the contact allowance on their current plan. No new contact was added." });
      if (outcome.kind === "duplicate") throw new TRPCError({ code: "CONFLICT", message: "This phone number has already been added to this collection." });
      if (outcome.kind === "missing") throw new TRPCError({ code: "NOT_FOUND", message: "This collection is no longer available." });
      return {
        accepted: true,
        atCapacity: outcome.reached,
        accountLimitReached: outcome.accountLimitReached,
        unsubscribeToken: outcome.unsubscribeToken,
        message: outcome.reached ? "Thanks — your contact was added. This collection is now at capacity."
          : outcome.accountLimitReached ? "Thanks — your contact was added. The owner's plan has now reached its account-wide contact limit."
          : "Thanks — your contact was added.",
      };
    }),
    listContacts: protectedProcedure.input(z.object({ collectionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [owner] = await db.select({ id: collections.id }).from(collections).where(and(
        eq(collections.id, input.collectionId), eq(collections.ownerId, ctx.user.id),
      )).limit(1);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found." });
      return db.select({
        id: contacts.id, name: contacts.name, phoneE164: contacts.phoneE164, countryCode: contacts.countryCode,
        email: contacts.email, emailOptIn: contacts.emailOptIn, smsOptIn: contacts.smsOptIn,
        status: contacts.status, createdAt: contacts.createdAt,
      }).from(contacts).where(and(eq(contacts.collectionId, input.collectionId), eq(contacts.status, "accepted"))).orderBy(desc(contacts.createdAt));
    }),
    removeContact: protectedProcedure.input(z.object({ collectionId: z.number().int().positive(), contactId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [owner] = await db.select({ id: collections.id }).from(collections).where(and(
        eq(collections.id, input.collectionId), eq(collections.ownerId, ctx.user.id),
      )).limit(1);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found." });
      await db.update(contacts).set({ status: "removed" }).where(and(eq(contacts.id, input.contactId), eq(contacts.collectionId, input.collectionId)));
      return { removed: true };
    }),
    exportVcf: protectedProcedure.input(z.object({ collectionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [collection] = await db.select({ id: collections.id, slug: collections.slug }).from(collections).where(and(
        eq(collections.id, input.collectionId), eq(collections.ownerId, ctx.user.id),
      )).limit(1);
      if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found." });
      const people = await db.select({ name: contacts.name, phoneE164: contacts.phoneE164, email: contacts.email })
        .from(contacts).where(and(eq(contacts.collectionId, collection.id), eq(contacts.status, "accepted")));
      return { filename: `${collection.slug}.vcf`, count: people.length, content: buildVcf(people) };
    }),
    markAlertsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      await db.update(ownerAlerts).set({ readAt: new Date() }).where(and(eq(ownerAlerts.ownerId, ctx.user.id), isNull(ownerAlerts.readAt)));
      return { read: true };
    }),
  }),

  profile: router({
    savePhone: onboardingProcedure.input(z.object({ phone: z.string().min(6).max(40) })).mutation(async ({ ctx, input }) => {
      let normalized: ReturnType<typeof normalizePhone>;
      try { normalized = normalizePhone(input.phone); }
      catch (error) {
        if (error instanceof CardoraValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        throw error;
      }
      const db = await requireDb();
      const [current] = await db.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const changed = current?.phoneE164 !== normalized.phoneE164;
      await db.update(users).set({
        phoneE164: normalized.phoneE164,
        phoneCountryCode: normalized.countryCode,
        ...(changed ? { phoneVerifiedAt: null } : {}),
      }).where(eq(users.id, ctx.user.id));
      if (changed) await db.update(phoneVerifications).set({ expiresAt: new Date(), verifiedAt: null }).where(eq(phoneVerifications.ownerId, ctx.user.id));
      return { phoneE164: normalized.phoneE164, phoneCountryCode: normalized.countryCode, verified: !changed && Boolean(current?.phoneVerifiedAt) };
    }),
    saveNotificationEmail: protectedProcedure.input(z.object({
      email: z.string().trim().email().max(320).refine(value => value.toLowerCase().endsWith("@gmail.com"), "Use a Gmail address ending in @gmail.com."),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [connection] = await db.select({ gmailAddress: gmailConnections.gmailAddress }).from(gmailConnections).where(eq(gmailConnections.ownerId, ctx.user.id)).limit(1);
      if (connection && connection.gmailAddress.toLowerCase() !== input.email.toLowerCase()) {
        throw new TRPCError({ code: "CONFLICT", message: "Disconnect the currently connected Gmail account before changing this address." });
      }
      await db.update(users).set({ notificationEmail: input.email }).where(eq(users.id, ctx.user.id));
      return { notificationEmail: input.email };
    }),
    connectGmail: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const config = googleOAuthConfig();
      if (!config.configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail OAuth will be available after its client credentials, exact HTTPS callback URL, and token-encryption key are configured on the production VPS." });
      const [profile] = await db.select({ notificationEmail: users.notificationEmail }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const email = profile?.notificationEmail ?? (ctx.user.email?.toLowerCase().endsWith("@gmail.com") ? ctx.user.email : null);
      if (!email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save a Gmail address in account settings before connecting Gmail." });
      const state = randomUUID() + randomUUID();
      const verifier = createCodeVerifier();
      await db.delete(gmailOauthStates).where(eq(gmailOauthStates.ownerId, ctx.user.id));
      await db.insert(gmailOauthStates).values({ ownerId: ctx.user.id, stateDigest: digestOAuthState(state), codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      ctx.res.cookie(GMAIL_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "none", path: "/api/cardora/google/callback", maxAge: 10 * 60 * 1000 });
      return { authorizationUrl: createGoogleConsentUrl({ state, codeChallenge: createCodeChallenge(verifier), config }) };
    }),
    disconnectGmail: protectedProcedure.mutation(async ({ ctx }) => {
      const disconnected = await disconnectOwnerGmail(ctx.user.id);
      return { disconnected, message: disconnected ? "Gmail has been disconnected from Cardora." : "No Gmail account is currently connected." };
    }),
    requestPhoneVerification: onboardingProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const [profile] = await db.select({ phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt })
        .from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!profile?.phoneE164 || profile.phoneCountryCode !== "KE" || !profile.phoneE164.startsWith("+254")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a Kenyan (+254) number can be verified for SMS." });
      }
      if (profile.phoneVerifiedAt) return { status: "verified" as const, message: "Your Kenyan number is already verified." };
      const now = Date.now();
      const [latest] = await db.select({ sentAt: phoneVerifications.sentAt }).from(phoneVerifications)
        .where(eq(phoneVerifications.ownerId, ctx.user.id)).orderBy(desc(phoneVerifications.sentAt)).limit(1);
      if (latest && now - latest.sentAt.getTime() < 60_000) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait one minute before requesting another verification code." });
      const [recentCount] = await db.select({ total: count() }).from(phoneVerifications).where(and(
        eq(phoneVerifications.ownerId, ctx.user.id), gte(phoneVerifications.sentAt, new Date(now - 60 * 60 * 1000)),
      ));
      if (Number(recentCount?.total ?? 0) >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You have reached the phone-verification limit. Try again later." });
      const key = process.env.NENA_API_KEY;
      if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nena SMS is not configured on this server." });
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const codeDigest = createHmac("sha256", key).update(`${ctx.user.id}:${profile.phoneE164}:${code}`).digest("hex");
      const expiresAt = new Date(now + 10 * 60 * 1000);
      await db.insert(phoneVerifications).values({ ownerId: ctx.user.id, phoneE164: profile.phoneE164, codeDigest, attempts: 0, expiresAt });
      try {
        const result = await createNenaClient().send(profile.phoneE164, `Cardora verification code: ${code}. It expires in 10 minutes. Do not share it.`);
        const accepted = result.accepted.some(number => canonicalNenaNumber(number) === canonicalNenaNumber(profile.phoneE164!));
        if (!accepted) throw new NenaProviderError("Nena did not accept the verification number.", undefined, "recipient_not_accepted");
      } catch (error) {
        await db.delete(phoneVerifications).where(and(eq(phoneVerifications.ownerId, ctx.user.id), eq(phoneVerifications.codeDigest, codeDigest)));
        const message = error instanceof NenaProviderError ? error.message : "Nena could not confirm the verification message. No code is considered sent.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
      return { status: "code_sent" as const, message: `Verification code queued to ${profile.phoneE164}. Enter it within 10 minutes.` };
    }),
    verifyPhoneCode: onboardingProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/, "Enter the six-digit code.") })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const key = process.env.NENA_API_KEY;
      if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Phone verification is not available right now." });
      const outcome = await db.transaction(async tx => {
        const [profile] = await tx.select({ phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
        if (!profile?.phoneE164 || profile.phoneCountryCode !== "KE" || !profile.phoneE164.startsWith("+254")) return "invalid_number" as const;
        if (profile.phoneVerifiedAt) return "already_verified" as const;
        const [challenge] = await tx.select().from(phoneVerifications).where(and(
          eq(phoneVerifications.ownerId, ctx.user.id), eq(phoneVerifications.phoneE164, profile.phoneE164),
        )).orderBy(desc(phoneVerifications.sentAt)).limit(1).for("update");
        if (!challenge) return "missing" as const;
        if (challenge.verifiedAt) return "already_verified" as const;
        if (challenge.expiresAt.getTime() <= Date.now()) return "expired" as const;
        if (challenge.attempts >= 5) return "locked" as const;
        const digest = createHmac("sha256", key).update(`${ctx.user.id}:${profile.phoneE164}:${input.code}`).digest("hex");
        const expected = Buffer.from(challenge.codeDigest, "hex");
        const received = Buffer.from(digest, "hex");
        const valid = expected.length === received.length && timingSafeEqual(expected, received);
        await tx.update(phoneVerifications).set({ attempts: challenge.attempts + 1 }).where(eq(phoneVerifications.id, challenge.id));
        if (!valid) return "incorrect" as const;
        const verifiedAt = new Date();
        await tx.update(phoneVerifications).set({ verifiedAt }).where(eq(phoneVerifications.id, challenge.id));
        await tx.update(users).set({ phoneVerifiedAt: verifiedAt }).where(eq(users.id, ctx.user.id));
        return "verified" as const;
      });
      if (outcome === "verified" || outcome === "already_verified") return { verified: true, message: "Your Kenyan phone number is verified for SMS." };
      const messages = {
        invalid_number: "Only a saved Kenyan (+254) number can be verified for SMS.",
        missing: "Request a new verification code first.",
        expired: "That code has expired. Request a new code.",
        locked: "Too many incorrect attempts. Request a new code later.",
        incorrect: "That code does not match. Check it and try again.",
      } as const;
      throw new TRPCError({ code: outcome === "incorrect" ? "BAD_REQUEST" : "PRECONDITION_FAILED", message: messages[outcome] });
    }),
  }),

  notifications: router({
    prepare: protectedProcedure.input(z.object({
      collectionId: z.number().int().positive(),
      channel: z.enum(["email", "sms"]),
      subject: z.string().trim().min(1).max(160),
      message: z.string().trim().min(1).max(4000),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [collection] = await db.select({ id: collections.id, title: collections.title }).from(collections).where(and(
        eq(collections.id, input.collectionId), eq(collections.ownerId, ctx.user.id),
      )).limit(1);
      if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found." });
      if (input.channel === "sms") {
        const [profile] = await db.select({ phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
        if (!profile || !isKenyaSmsEligible(profile)) throw new TRPCError({ code: "FORBIDDEN", message: "SMS is available only to owners with a verified Kenyan (+254) number." });
      }
      const eligibleContacts = await db.select({ id: contacts.id, name: contacts.name, phoneE164: contacts.phoneE164, email: contacts.email }).from(contacts).where(and(
        eq(contacts.collectionId, input.collectionId), eq(contacts.status, "accepted"),
        input.channel === "email"
          ? and(eq(contacts.emailOptIn, true), isNotNull(contacts.email))
          : and(eq(contacts.smsOptIn, true), eq(contacts.countryCode, "KE")),
      )).orderBy(contacts.id);
      const recipients = eligibleContacts.map(person => ({
        id: person.id,
        name: person.name,
        destination: input.channel === "email" ? (person.email ?? "") : person.phoneE164,
      }));
      const recipientCount = recipients.length;
      const recipientSnapshot = campaignRecipientSnapshotHash(input.channel, input.subject, input.message, recipients);
      const [inserted] = await db.insert(campaigns).values({
        ownerId: ctx.user.id, collectionId: collection.id, channel: input.channel,
        subject: input.subject, message: input.message, eligibleRecipientCount: recipientCount,
        recipientSnapshotHash: recipientSnapshot, status: "not_sent",
      }).returning({ id: campaigns.id });
      const campaignId = inserted.id;
      return {
        campaignId,
        collectionId: collection.id,
        collectionTitle: collection.title,
        channel: input.channel,
        subject: input.subject,
        message: input.message,
        status: "not_sent" as const,
        recipientCount,
        recipients,
        recipientSnapshotHash: recipientSnapshot,
        reviewHash: campaignReviewHash({ campaignId, collectionId: collection.id, channel: input.channel, subject: input.subject, message: input.message, recipientSnapshotHash: recipientSnapshot }),
      };
    }),
    providerStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const [profile] = await db.select({ phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!profile || profile.phoneCountryCode !== "KE") throw new TRPCError({ code: "FORBIDDEN", message: "Kenyan SMS controls are not available for this account." });
      return createNenaClient().connectionStatus();
    }),
    send: protectedProcedure.input(z.object({ campaignId: z.number().int().positive(), reviewHash: z.string().regex(/^[a-f0-9]{64}$/) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const reservation = await db.transaction(async tx => {
        const [campaign] = await tx.select().from(campaigns).where(and(eq(campaigns.id, input.campaignId), eq(campaigns.ownerId, ctx.user.id))).limit(1).for("update");
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign draft not found." });
        if (campaign.status !== "not_sent") throw new TRPCError({ code: "CONFLICT", message: "This campaign has already been sent or is being processed." });
        const [collection] = await tx.select({ id: collections.id, title: collections.title, slug: collections.slug, canonicalUrl: collections.canonicalUrl }).from(collections).where(and(eq(collections.id, campaign.collectionId), eq(collections.ownerId, ctx.user.id))).limit(1);
        if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found." });
        const eligibleContacts = campaign.channel === "sms"
          ? await tx.select({ id: contacts.id, name: contacts.name, phoneE164: contacts.phoneE164, email: contacts.email, unsubscribeToken: contacts.unsubscribeToken }).from(contacts).where(and(
            eq(contacts.collectionId, collection.id), eq(contacts.status, "accepted"), eq(contacts.smsOptIn, true), eq(contacts.countryCode, "KE"),
          )).orderBy(contacts.id)
          : await tx.select({ id: contacts.id, name: contacts.name, phoneE164: contacts.phoneE164, email: contacts.email, unsubscribeToken: contacts.unsubscribeToken }).from(contacts).where(and(
            eq(contacts.collectionId, collection.id), eq(contacts.status, "accepted"), eq(contacts.emailOptIn, true), isNotNull(contacts.email),
          )).orderBy(contacts.id);
        const reviewRecipients = eligibleContacts.map(person => ({
          id: person.id,
          name: person.name,
          destination: campaign.channel === "email" ? (person.email ?? "") : person.phoneE164,
        }));
        const currentSnapshot = campaignRecipientSnapshotHash(campaign.channel, campaign.subject, campaign.message, reviewRecipients);
        const expectedReview = campaign.recipientSnapshotHash ? campaignReviewHash({
          campaignId: campaign.id,
          collectionId: campaign.collectionId,
          channel: campaign.channel,
          subject: campaign.subject,
          message: campaign.message,
          recipientSnapshotHash: campaign.recipientSnapshotHash,
        }) : "";
        if (!eligibleContacts.length || campaign.eligibleRecipientCount !== eligibleContacts.length || currentSnapshot !== campaign.recipientSnapshotHash || input.reviewHash !== expectedReview) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The recipient set or message changed after review. No message was sent. Save a fresh draft, review the updated recipients and confirm again." });
        }
        let gmailConnection: typeof gmailConnections.$inferSelect | null = null;
        if (campaign.channel === "sms") {
          const [profile] = await tx.select({ phoneE164: users.phoneE164, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
          if (!profile || !isKenyaSmsEligible(profile)) throw new TRPCError({ code: "FORBIDDEN", message: "SMS is available only to owners with a verified Kenyan (+254) number." });
          if (!process.env.NENA_API_KEY) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nena SMS is not configured on this server." });
        } else {
          if (!googleOAuthConfig().configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail OAuth is not configured in this environment. Configure its credentials on the production VPS before sending." });
          const [profile] = await tx.select({ notificationEmail: users.notificationEmail, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
          const requiredEmail = profile?.notificationEmail ?? (profile?.email?.toLowerCase().endsWith("@gmail.com") ? profile.email : null);
          const [connection] = await tx.select().from(gmailConnections).where(eq(gmailConnections.ownerId, ctx.user.id)).limit(1);
          if (!requiredEmail || !connection || connection.gmailAddress.toLowerCase() !== requiredEmail.toLowerCase()) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect the same Gmail address saved in account settings before sending email." });
          }
          gmailConnection = connection;
        }
        await tx.update(campaigns).set({ status: "sending", failureReason: null }).where(eq(campaigns.id, campaign.id));
        return { campaign, collection, gmailConnection, recipients: eligibleContacts };
      });
      const recipients = reservation.recipients;
      if (!recipients.length) {
        const reason = reservation.campaign.channel === "sms" ? "No opted-in Kenyan contacts remain eligible." : "No opted-in email contacts remain eligible.";
        await db.update(campaigns).set({ status: "failed", eligibleRecipientCount: 0, failureReason: reason }).where(eq(campaigns.id, reservation.campaign.id));
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason });
      }
      let queuedCount = 0;
      let skippedCount = 0;
      const providerIds: string[] = [];
      let failureReason: string | null = null;
      if (reservation.campaign.channel === "sms") {
        const numbers = recipients.map(person => person.phoneE164);
        for (let index = 0; index < numbers.length; index += 50) {
          const batch = numbers.slice(index, index + 50);
          try {
            const result = await createNenaClient().send(batch, reservation.campaign.message);
            queuedCount += result.accepted.length;
            skippedCount += Math.max(result.skippedCount, batch.length - result.accepted.length);
            if (result.providerMessageId) providerIds.push(result.providerMessageId);
            await db.update(campaigns).set({ queuedRecipientCount: queuedCount, skippedRecipientCount: skippedCount, providerMessageIds: providerIds.length ? JSON.stringify(providerIds) : null }).where(eq(campaigns.id, reservation.campaign.id));
          } catch (error) {
            skippedCount += Math.max(0, recipients.length - queuedCount - skippedCount);
            failureReason = error instanceof NenaProviderError ? error.message : "Nena could not confirm the delivery outcome. Check provider logs before retrying.";
            break;
          }
        }
      } else {
        try {
          if (!reservation.gmailConnection) throw new GoogleIntegrationError("Gmail account connection is missing. Reconnect before sending.", "connection_missing");
          const config = googleOAuthConfig();
          const refreshToken = decryptRefreshToken(reservation.gmailConnection, config.encryptionKey);
          const accessToken = await refreshGoogleAccessToken(refreshToken, config);
          for (let index = 0; index < recipients.length; index += 5) {
            const batch = recipients.slice(index, index + 5);
            const outcomes = await Promise.allSettled(batch.map(async person => {
              if (!person.email) throw new GoogleIntegrationError("An opted-in contact no longer has an email address.", "recipient_invalid");
              const preferenceUrl = new URL(reservation.collection.canonicalUrl);
              preferenceUrl.searchParams.set("unsubscribe", person.unsubscribeToken);
              return sendGmailMessage(accessToken, person.email, reservation.campaign.subject, `${reservation.campaign.message.trim()}\n\n—\nManage your notification preferences: ${preferenceUrl.toString()}`);
            }));
            for (const outcome of outcomes) {
              if (outcome.status === "fulfilled") { queuedCount += 1; providerIds.push(outcome.value.id); }
              else if (!failureReason) failureReason = outcome.reason instanceof GoogleIntegrationError ? outcome.reason.message : "Gmail did not confirm this email. Review Gmail sent mail before retrying.";
            }
            await db.update(campaigns).set({ queuedRecipientCount: queuedCount, skippedRecipientCount: Math.max(0, recipients.length - queuedCount), providerMessageIds: providerIds.length ? JSON.stringify(providerIds) : null }).where(eq(campaigns.id, reservation.campaign.id));
            if (failureReason) break;
          }
          skippedCount = Math.max(0, recipients.length - queuedCount);
        } catch (error) {
          failureReason = error instanceof GoogleIntegrationError ? error.message : "Gmail could not confirm the campaign outcome. Review Gmail sent mail before retrying.";
          skippedCount = Math.max(0, recipients.length - queuedCount);
        }
      }
      const status = queuedCount === recipients.length ? "queued" : queuedCount > 0 ? "partial" : "failed";
      await db.update(campaigns).set({
        status, eligibleRecipientCount: recipients.length, queuedRecipientCount: queuedCount, skippedRecipientCount: skippedCount,
        providerMessageIds: providerIds.length ? JSON.stringify(providerIds) : null, failureReason, sentAt: queuedCount ? new Date() : null,
      }).where(eq(campaigns.id, reservation.campaign.id));
      const providerLabel = reservation.campaign.channel === "sms" ? "Nena" : "Gmail";
      return { campaignId: reservation.campaign.id, status, eligibleCount: recipients.length, queuedCount, skippedCount, message: status === "queued" ? `${providerLabel} accepted the campaign for ${queuedCount} opted-in contact${queuedCount === 1 ? "" : "s"}.` : status === "partial" ? `${providerLabel} accepted ${queuedCount} of ${recipients.length} eligible contacts. Review the result before taking further action.` : failureReason ?? `${providerLabel} did not confirm any queued recipients.` };
    }),
    unsubscribe: publicProcedure.input(z.object({ token: z.string().min(32).max(64) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.unsubscribeToken, input.token)).limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "This unsubscribe link is not valid." });
      await db.update(contacts).set({ emailOptIn: false, smsOptIn: false, unsubscribedAt: new Date() }).where(eq(contacts.id, contact.id));
      return { unsubscribed: true, message: "You will not receive further email or SMS updates for this collection." };
    }),
  }),
});
