import { and, count, eq } from "drizzle-orm";
import { contacts, collections, ownerSubscriptions, subscriptionPlans, type SubscriptionPlan } from "../drizzle/schema";
import { getSubscriptionDisplayStatus, hasQuotaCapacity, isSubscriptionPeriodCurrent, remainingQuota } from "./subscriptionLimits";

export type SafePlan = Pick<SubscriptionPlan,
  "id" | "code" | "name" | "description" | "contactLimit" | "collectionLimit" | "priceMinor" | "currency" | "billingInterval" | "isActive" | "isDefault"
>;

export interface OwnerEntitlement {
  plan: SafePlan;
  subscription: {
    status: "free" | "active" | "past_due" | "canceled" | "expired";
    source: "default" | "admin" | "paystack";
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  };
  usage: {
    acceptedContacts: number;
    collections: number;
    contactsRemaining: number;
    collectionsRemaining: number;
    canAcceptContact: boolean;
    canCreateCollection: boolean;
  };
}

/** Resolve a current owner assignment, or fall back to the single active default plan. */
export async function getOwnerEntitlement(db: any, ownerId: number, now = new Date()): Promise<OwnerEntitlement> {
  const [defaultPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isDefault, true)).limit(1);
  if (!defaultPlan || !defaultPlan.isActive) throw new Error("Cardora's active default subscription plan is not configured.");

  const [row] = await db.select({ assignment: ownerSubscriptions, plan: subscriptionPlans })
    .from(ownerSubscriptions)
    .innerJoin(subscriptionPlans, eq(ownerSubscriptions.planId, subscriptionPlans.id))
    .where(eq(ownerSubscriptions.ownerId, ownerId))
    .limit(1);

  const assignmentIsCurrent = Boolean(row && row.plan.isActive && isSubscriptionPeriodCurrent({
    status: row.assignment.status,
    currentPeriodEnd: row.assignment.currentPeriodEnd,
  }, now));
  const plan = assignmentIsCurrent ? row!.plan : defaultPlan;
  const [collectionCount] = await db.select({ total: count() }).from(collections).where(eq(collections.ownerId, ownerId));
  const [contactCount] = await db.select({ total: count() }).from(contacts)
    .innerJoin(collections, eq(contacts.collectionId, collections.id))
    .where(and(eq(collections.ownerId, ownerId), eq(contacts.status, "accepted")));
  const collectionsUsed = Number(collectionCount?.total ?? 0);
  const contactsUsed = Number(contactCount?.total ?? 0);
  return {
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      contactLimit: plan.contactLimit,
      collectionLimit: plan.collectionLimit,
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      isDefault: plan.isDefault,
    },
    subscription: {
      status: getSubscriptionDisplayStatus(row?.assignment ?? null, now),
      source: row?.assignment.source ?? "default",
      currentPeriodStart: row?.assignment.currentPeriodStart ?? null,
      currentPeriodEnd: row?.assignment.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: row?.assignment.cancelAtPeriodEnd ?? false,
    },
    usage: {
      acceptedContacts: contactsUsed,
      collections: collectionsUsed,
      contactsRemaining: remainingQuota(contactsUsed, plan.contactLimit),
      collectionsRemaining: remainingQuota(collectionsUsed, plan.collectionLimit),
      canAcceptContact: hasQuotaCapacity(contactsUsed, plan.contactLimit),
      canCreateCollection: hasQuotaCapacity(collectionsUsed, plan.collectionLimit),
    },
  };
}

export async function listAvailablePlans(db: any): Promise<SafePlan[]> {
  return db.select({
    id: subscriptionPlans.id,
    code: subscriptionPlans.code,
    name: subscriptionPlans.name,
    description: subscriptionPlans.description,
    contactLimit: subscriptionPlans.contactLimit,
    collectionLimit: subscriptionPlans.collectionLimit,
    priceMinor: subscriptionPlans.priceMinor,
    currency: subscriptionPlans.currency,
    billingInterval: subscriptionPlans.billingInterval,
    isActive: subscriptionPlans.isActive,
    isDefault: subscriptionPlans.isDefault,
  }).from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.priceMinor, subscriptionPlans.id);
}
