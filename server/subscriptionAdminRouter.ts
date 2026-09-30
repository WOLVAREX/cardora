import { and, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collections, contacts, ownerQuotaOverrides, ownerSubscriptions, subscriptionPlans, users } from "../drizzle/schema";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { getSubscriptionDisplayStatus, isActivePaystackAssignment, isSubscriptionPeriodCurrent, toMinorUnits } from "./subscriptionLimits";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
  return db;
}

const pageInput = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(100).default(20),
  search: z.string().trim().max(120).default(""),
});

const planInput = z.object({
  id: z.number().int().positive().optional(),
  code: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  contactLimit: z.number().int().min(1).max(1_000_000),
  collectionLimit: z.number().int().min(1).max(10_000),
  priceMajor: z.number().finite().min(0).max(50_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billingInterval: z.enum(["monthly", "yearly"]),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

const assignInput = z.object({
  ownerId: z.number().int().positive(),
  planId: z.number().int().positive(),
  status: z.enum(["active", "past_due", "canceled", "expired"]),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const subscriptionAdminRouter = router({
  plans: adminProcedure.query(async () => {
    const db = await requireDb();
    const [plans, activeAssignments] = await Promise.all([
      db.select().from(subscriptionPlans).orderBy(subscriptionPlans.priceMinor, subscriptionPlans.id),
      db.select({ planId: ownerSubscriptions.planId, status: ownerSubscriptions.status, currentPeriodEnd: ownerSubscriptions.currentPeriodEnd, planActive: subscriptionPlans.isActive })
        .from(ownerSubscriptions).innerJoin(subscriptionPlans, eq(ownerSubscriptions.planId, subscriptionPlans.id))
        .where(eq(ownerSubscriptions.status, "active")),
    ]);
    const countByPlan = new Map<number, number>();
    for (const assignment of activeAssignments) {
      if (!assignment.planActive || !isSubscriptionPeriodCurrent(assignment, new Date())) continue;
      countByPlan.set(assignment.planId, (countByPlan.get(assignment.planId) ?? 0) + 1);
    }
    return plans.map(plan => ({ ...plan, activeSubscribers: countByPlan.get(plan.id) ?? 0 }));
  }),

  savePlan: adminProcedure.input(planInput).mutation(async ({ input }) => {
    const db = await requireDb();
    let priceMinor: number;
    try { priceMinor = toMinorUnits(input.priceMajor, input.currency); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Enter a valid plan price." }); }
    if (input.isDefault && (!input.isActive || priceMinor !== 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The active default plan must be free." });
    }
    if (input.code === "free" && priceMinor !== 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The built-in free plan cannot have a charge." });
    }

    let planId = input.id;
    try {
      await db.transaction(async tx => {
        if (input.isDefault) {
          await tx.select({ id: subscriptionPlans.id }).from(subscriptionPlans)
            .where(eq(subscriptionPlans.isDefault, true)).limit(1).for("update");
        }
        if (input.id) {
          const [current] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.id)).limit(1).for("update");
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found." });
          if (current.isDefault && (!input.isDefault || !input.isActive || priceMinor !== 0)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keep an active, free default plan. Set another free plan as the default before changing this one." });
          }
          if (current.code !== input.code) {
            const [linked] = await tx.select({ total: count() }).from(ownerSubscriptions).where(eq(ownerSubscriptions.planId, current.id));
            if (Number(linked?.total ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A plan's code cannot change while an account is assigned to it." });
          }
          if (input.isDefault) await tx.update(subscriptionPlans).set({ isDefault: false }).where(eq(subscriptionPlans.isDefault, true));
          await tx.update(subscriptionPlans).set({
            code: input.code,
            name: input.name,
            description: input.description,
            contactLimit: input.contactLimit,
            collectionLimit: input.collectionLimit,
            priceMinor,
            currency: input.currency,
            billingInterval: input.billingInterval,
            isActive: input.isActive,
            isDefault: input.isDefault,
          }).where(eq(subscriptionPlans.id, input.id));
        } else {
          if (input.isDefault) await tx.update(subscriptionPlans).set({ isDefault: false }).where(eq(subscriptionPlans.isDefault, true));
          const [created] = await tx.insert(subscriptionPlans).values({
            code: input.code,
            name: input.name,
            description: input.description,
            contactLimit: input.contactLimit,
            collectionLimit: input.collectionLimit,
            priceMinor,
            currency: input.currency,
            billingInterval: input.billingInterval,
            isActive: input.isActive,
            isDefault: input.isDefault,
          }).returning({ id: subscriptionPlans.id });
          planId = created.id;
        }
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (String(error).includes("ER_DUP_ENTRY") || (typeof error === "object" && error !== null && "code" in error && error.code === "23505")) throw new TRPCError({ code: "CONFLICT", message: "A plan with that code already exists." });
      throw error;
    }
    const [saved] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId!)).limit(1);
    if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The plan could not be loaded after saving." });
    return saved;
  }),

  accounts: adminProcedure.input(pageInput).query(async ({ input }) => {
    const db = await requireDb();
    const term = input.search.trim();
    const numericId = /^\d+$/.test(term) ? Number(term) : null;
    const filter = term ? or(
      like(users.name, `%${term}%`),
      like(users.email, `%${term}%`),
      like(users.emailAuthEmail, `%${term}%`),
      ...(numericId !== null ? [eq(users.id, numericId)] : []),
    ) : undefined;
    const [rows, totalRows, defaultRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, emailAuthEmail: users.emailAuthEmail, role: users.role })
        .from(users).where(filter).orderBy(desc(users.createdAt)).limit(input.pageSize).offset(input.page * input.pageSize),
      db.select({ total: count() }).from(users).where(filter),
      db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isDefault, true)).limit(1),
    ]);
    const defaultPlan = defaultRows[0];
    if (!defaultPlan?.isActive) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's active default subscription plan is not configured." });
    const ids = rows.map(row => row.id);
    if (!ids.length) return { rows: [], total: Number(totalRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize };

    const [assignments, collectionCounts, contactCounts, quotaOverrides] = await Promise.all([
      db.select({ assignment: ownerSubscriptions, plan: subscriptionPlans }).from(ownerSubscriptions)
        .innerJoin(subscriptionPlans, eq(ownerSubscriptions.planId, subscriptionPlans.id))
        .where(inArray(ownerSubscriptions.ownerId, ids)),
      db.select({ ownerId: collections.ownerId, total: count() }).from(collections)
        .where(inArray(collections.ownerId, ids)).groupBy(collections.ownerId),
      db.select({ ownerId: collections.ownerId, total: count() }).from(contacts)
        .innerJoin(collections, eq(contacts.collectionId, collections.id))
        .where(and(inArray(collections.ownerId, ids), eq(contacts.status, "accepted"))).groupBy(collections.ownerId),
      db.select().from(ownerQuotaOverrides).where(inArray(ownerQuotaOverrides.ownerId, ids)),
    ]);
    const assignmentMap = new Map(assignments.map(row => [row.assignment.ownerId, row]));
    const collectionMap = new Map(collectionCounts.map(row => [row.ownerId, Number(row.total ?? 0)]));
    const contactMap = new Map(contactCounts.map(row => [row.ownerId, Number(row.total ?? 0)]));
    const quotaMap = new Map(quotaOverrides.map(row => [row.ownerId, row]));
    const now = new Date();
    return {
      rows: rows.map(row => {
        const record = assignmentMap.get(row.id);
        const isCurrent = Boolean(record && record.plan.isActive && isSubscriptionPeriodCurrent({ status: record.assignment.status, currentPeriodEnd: record.assignment.currentPeriodEnd }, now));
        const effectivePlan = isCurrent ? record!.plan : defaultPlan;
        const quota = quotaMap.get(row.id);
        const status = getSubscriptionDisplayStatus(record?.assignment ?? null, now);
        return {
          id: row.id,
          name: row.name,
          email: row.emailAuthEmail ?? row.email,
          role: row.role,
          plan: { id: effectivePlan.id, code: effectivePlan.code, name: effectivePlan.name, contactLimit: quota?.contactLimit ?? effectivePlan.contactLimit, collectionLimit: quota?.collectionLimit ?? effectivePlan.collectionLimit },
          subscription: {
            status,
            source: record?.assignment.source ?? "default" as const,
            currentPeriodEnd: record?.assignment.currentPeriodEnd ?? null,
          },
          acceptedContacts: contactMap.get(row.id) ?? 0,
          collections: collectionMap.get(row.id) ?? 0,
        };
      }),
      total: Number(totalRows[0]?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  assign: adminProcedure.input(assignInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const currentPeriodEnd = input.endsOn ? new Date(`${input.endsOn}T23:59:59.999Z`) : null;
    if (input.endsOn && (!Number.isFinite(currentPeriodEnd!.getTime()) || currentPeriodEnd!.toISOString().slice(0, 10) !== input.endsOn)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid subscription end date." });
    }
    await db.transaction(async tx => {
      const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.ownerId)).limit(1).for("update");
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found." });
      const [plan] = await tx.select({ id: subscriptionPlans.id, isActive: subscriptionPlans.isActive }).from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found." });
      if (!plan.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate this plan before assigning it." });
      const [existing] = await tx.select().from(ownerSubscriptions).where(eq(ownerSubscriptions.ownerId, input.ownerId)).limit(1).for("update");
      if (isActivePaystackAssignment(existing ?? null)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This account has an active Paystack subscription. Cancel it through Paystack before changing its plan." });
      }
      const values = {
        planId: input.planId,
        status: input.status,
        source: "admin" as const,
        paystackCustomerCode: null,
        paystackSubscriptionCode: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        assignedBy: ctx.user.id,
      };
      if (existing) {
        await tx.update(ownerSubscriptions).set(values).where(eq(ownerSubscriptions.ownerId, input.ownerId));
      } else {
        await tx.insert(ownerSubscriptions).values({ ownerId: input.ownerId, ...values });
      }
    });
    return { success: true } as const;
  }),
});
