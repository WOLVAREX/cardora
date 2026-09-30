import { and, count, desc, eq, isNull } from "drizzle-orm";
import { contacts, collections, ownerAlerts } from "../drizzle/schema";
import { getDb } from "./db";

export async function publicCollectionBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    id: collections.id,
    ownerId: collections.ownerId,
    slug: collections.slug,
    title: collections.title,
    description: collections.description,
    canonicalUrl: collections.canonicalUrl,
    allowedCountryCodes: collections.allowedCountryCodes,
    contactLimit: collections.contactLimit,
    usedSlots: collections.usedSlots,
    status: collections.status,
  }).from(collections).where(eq(collections.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function listOwnerCollections(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(collections).where(eq(collections.ownerId, ownerId)).orderBy(desc(collections.createdAt));
  return Promise.all(rows.map(async collection => {
    const [result] = await db.select({ total: count() }).from(contacts).where(and(
      eq(contacts.collectionId, collection.id),
      eq(contacts.status, "accepted"),
    ));
    return { ...collection, activeContactCount: Number(result?.total ?? 0) };
  }));
}

export async function createCapacityAlert(tx: any, ownerId: number, collectionId: number, title: string) {
  await tx.insert(ownerAlerts).values({
    ownerId,
    collectionId,
    kind: "capacity_reached",
    message: `“${title}” is at capacity. Its collection link has stopped accepting contacts.`,
  });
}

export async function createAccountLimitAlert(tx: any, ownerId: number, collectionId: number, planName: string, contactLimit: number) {
  const [unread] = await tx.select({ id: ownerAlerts.id }).from(ownerAlerts).where(and(
    eq(ownerAlerts.ownerId, ownerId),
    eq(ownerAlerts.kind, "account_limit_reached"),
    isNull(ownerAlerts.readAt),
  )).limit(1);
  if (unread) return;
  await tx.insert(ownerAlerts).values({
    ownerId,
    collectionId,
    kind: "account_limit_reached",
    message: `Your ${planName} plan has reached its ${contactLimit}-contact account limit. New contacts are paused across your links until your usage or plan changes.`,
  });
}
