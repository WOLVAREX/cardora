import { and, count, desc, eq, gte, inArray, like, or, sum } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { campaigns, collections, contacts, users } from "../drizzle/schema";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createNenaClient } from "./cardoraNena";
import { subscriptionAdminRouter } from "./subscriptionAdminRouter";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
  return db;
}
const pageInput = z.object({ page: z.number().int().min(0).default(0), pageSize: z.number().int().min(10).max(100).default(20) });
const searchPageInput = pageInput.extend({ search: z.string().trim().max(120).default("") });
const asNumber = (value: unknown) => Number(value ?? 0);

export const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const db = await requireDb();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [allUsers, newUsers, allCollections, allContacts, activeContacts, emailOptIns, smsOptIns, allCampaigns, totalCapacity, usedSlots, statusRows, countryRows, campaignRows] = await Promise.all([
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(users).where(gte(users.createdAt, since)),
      db.select({ total: count() }).from(collections),
      db.select({ total: count() }).from(contacts),
      db.select({ total: count() }).from(contacts).where(eq(contacts.status, "accepted")),
      db.select({ total: count() }).from(contacts).where(and(eq(contacts.status, "accepted"), eq(contacts.emailOptIn, true))),
      db.select({ total: count() }).from(contacts).where(and(eq(contacts.status, "accepted"), eq(contacts.smsOptIn, true), eq(contacts.countryCode, "KE"))),
      db.select({ total: count() }).from(campaigns),
      db.select({ total: sum(collections.contactLimit) }).from(collections),
      db.select({ total: sum(collections.usedSlots) }).from(collections),
      db.select({ status: collections.status, total: count() }).from(collections).groupBy(collections.status),
      db.select({ countryCode: contacts.countryCode, total: count() }).from(contacts).where(eq(contacts.status, "accepted")).groupBy(contacts.countryCode),
      db.select({ status: campaigns.status, total: count() }).from(campaigns).groupBy(campaigns.status),
    ]);
    const recentUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt, emailVerifiedAt: users.emailVerifiedAt })
      .from(users).orderBy(desc(users.createdAt)).limit(8);
    const recentCollections = await db.select({ id: collections.id, ownerId: collections.ownerId, slug: collections.slug, title: collections.title, allowedCountryCodes: collections.allowedCountryCodes, contactLimit: collections.contactLimit, usedSlots: collections.usedSlots, status: collections.status, createdAt: collections.createdAt })
      .from(collections).orderBy(desc(collections.createdAt)).limit(8);
    const recentCampaigns = await db.select({ id: campaigns.id, ownerId: campaigns.ownerId, collectionId: campaigns.collectionId, channel: campaigns.channel, subject: campaigns.subject, eligibleRecipientCount: campaigns.eligibleRecipientCount, queuedRecipientCount: campaigns.queuedRecipientCount, skippedRecipientCount: campaigns.skippedRecipientCount, status: campaigns.status, createdAt: campaigns.createdAt, sentAt: campaigns.sentAt })
      .from(campaigns).orderBy(desc(campaigns.createdAt)).limit(8);
    const collectionStatus = Object.fromEntries(statusRows.map(row => [row.status, asNumber(row.total)]));
    const campaignStatus = Object.fromEntries(campaignRows.map(row => [row.status, asNumber(row.total)]));
    return {
      metrics: {
        totalUsers: asNumber(allUsers[0]?.total), newUsers30Days: asNumber(newUsers[0]?.total),
        totalCollections: asNumber(allCollections[0]?.total), openCollections: collectionStatus.open ?? 0, fullCollections: collectionStatus.full ?? 0, pausedCollections: collectionStatus.paused ?? 0,
        totalContacts: asNumber(allContacts[0]?.total), acceptedContacts: asNumber(activeContacts[0]?.total), emailOptIns: asNumber(emailOptIns[0]?.total), smsOptIns: asNumber(smsOptIns[0]?.total),
        totalCapacity: asNumber(totalCapacity[0]?.total), usedSlots: asNumber(usedSlots[0]?.total), totalCampaigns: asNumber(allCampaigns[0]?.total),
      },
      campaignStatus,
      countries: countryRows.map(row => ({ countryCode: row.countryCode, contacts: asNumber(row.total) })).sort((a, b) => b.contacts - a.contacts),
      recentUsers,
      recentCollections,
      recentCampaigns,
    };
  }),

  users: adminProcedure.input(searchPageInput).query(async ({ input }) => {
    const db = await requireDb();
    const term = input.search.trim();
    const filter = term ? or(like(users.name, `%${term}%`), like(users.email, `%${term}%`)) : undefined;
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, phoneCountryCode: users.phoneCountryCode, phoneVerifiedAt: users.phoneVerifiedAt, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn })
      .from(users).where(filter).orderBy(desc(users.createdAt)).limit(input.pageSize).offset(input.page * input.pageSize);
    const [total] = await db.select({ total: count() }).from(users).where(filter);
    return { rows, total: asNumber(total?.total), page: input.page, pageSize: input.pageSize };
  }),

  collections: adminProcedure.input(searchPageInput).query(async ({ input }) => {
    const db = await requireDb();
    const term = input.search.trim();
    const ownerMatches = term ? await db.select({ id: users.id }).from(users).where(or(like(users.name, `%${term}%`), like(users.email, `%${term}%`))) : [];
    const clauses = term ? [
      like(collections.title, `%${term}%`),
      like(collections.slug, `%${term}%`),
      like(collections.status, `%${term}%`),
      ...(ownerMatches.length ? [inArray(collections.ownerId, ownerMatches.map(owner => owner.id))] : []),
      ...( /^\d+$/.test(term) ? [eq(collections.id, Number(term)), eq(collections.ownerId, Number(term))] : []),
    ] : [];
    const filter = term ? or(...clauses) : undefined;
    const rows = await db.select({ id: collections.id, ownerId: collections.ownerId, slug: collections.slug, title: collections.title, allowedCountryCodes: collections.allowedCountryCodes, contactLimit: collections.contactLimit, usedSlots: collections.usedSlots, status: collections.status, createdAt: collections.createdAt })
      .from(collections).where(filter).orderBy(desc(collections.createdAt)).limit(input.pageSize).offset(input.page * input.pageSize);
    const ownerIds = Array.from(new Set(rows.map(row => row.ownerId)));
    const owners = ownerIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ownerIds)) : [];
    const ownerMap = new Map(owners.map(owner => [owner.id, owner]));
    const ids = rows.map(row => row.id);
    const contactCounts = ids.length ? await db.select({ collectionId: contacts.collectionId, total: count() }).from(contacts).where(and(inArray(contacts.collectionId, ids), eq(contacts.status, "accepted"))).groupBy(contacts.collectionId) : [];
    const contactMap = new Map(contactCounts.map(item => [item.collectionId, asNumber(item.total)]));
    const [total] = await db.select({ total: count() }).from(collections).where(filter);
    return { rows: rows.map(row => ({ ...row, owner: ownerMap.get(row.ownerId) ?? null, activeContactCount: contactMap.get(row.id) ?? 0 })), total: asNumber(total?.total), page: input.page, pageSize: input.pageSize };
  }),

  campaigns: adminProcedure.input(searchPageInput).query(async ({ input }) => {
    const db = await requireDb();
    const term = input.search.trim();
    const ownerMatches = term ? await db.select({ id: users.id }).from(users).where(or(like(users.name, `%${term}%`), like(users.email, `%${term}%`))) : [];
    const collectionMatches = term ? await db.select({ id: collections.id }).from(collections).where(or(like(collections.title, `%${term}%`), like(collections.slug, `%${term}%`))) : [];
    const clauses = term ? [
      like(campaigns.subject, `%${term}%`),
      like(campaigns.channel, `%${term}%`),
      like(campaigns.status, `%${term}%`),
      ...(ownerMatches.length ? [inArray(campaigns.ownerId, ownerMatches.map(owner => owner.id))] : []),
      ...(collectionMatches.length ? [inArray(campaigns.collectionId, collectionMatches.map(collection => collection.id))] : []),
      ...( /^\d+$/.test(term) ? [eq(campaigns.id, Number(term)), eq(campaigns.ownerId, Number(term)), eq(campaigns.collectionId, Number(term))] : []),
    ] : [];
    const filter = term ? or(...clauses) : undefined;
    const rows = await db.select({ id: campaigns.id, ownerId: campaigns.ownerId, collectionId: campaigns.collectionId, channel: campaigns.channel, subject: campaigns.subject, eligibleRecipientCount: campaigns.eligibleRecipientCount, queuedRecipientCount: campaigns.queuedRecipientCount, skippedRecipientCount: campaigns.skippedRecipientCount, status: campaigns.status, failureReason: campaigns.failureReason, createdAt: campaigns.createdAt, sentAt: campaigns.sentAt })
      .from(campaigns).where(filter).orderBy(desc(campaigns.createdAt)).limit(input.pageSize).offset(input.page * input.pageSize);
    const [total] = await db.select({ total: count() }).from(campaigns).where(filter);
    return { rows, total: asNumber(total?.total), page: input.page, pageSize: input.pageSize };
  }),

  nenaStatus: adminProcedure.query(async () => createNenaClient().connectionStatus()),
  subscriptions: subscriptionAdminRouter,
});
