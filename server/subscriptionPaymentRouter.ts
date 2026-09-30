import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ownerSubscriptions, subscriptionPayments, subscriptionPlans, users } from "../drizzle/schema";
import { normalizePhone } from "./cardora";
import { getDb } from "./db";
import { addBillingInterval, createCardoraPaymentReference, createPaystackClient, getPaystackConfig, verifiedTransactionMatches } from "./paystack";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cardora's database is not available right now." });
  return db;
}

function requirePaystack() {
  const config = getPaystackConfig();
  if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Card payments are not configured on this server yet." });
  return createPaystackClient(config);
}

const planInput = z.object({ planId: z.number().int().positive() });

export const subscriptionPaymentRouter = router({
  startCard: protectedProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const paystack = requirePaystack();
    const [owner] = await db.select({ id: users.id, email: users.emailAuthEmail }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!owner?.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add an email address to your account before paying." });
    const [plan] = await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.id, input.planId), eq(subscriptionPlans.isActive, true))).limit(1);
    if (!plan || plan.priceMinor <= 0) throw new TRPCError({ code: "NOT_FOUND", message: "This paid plan is unavailable." });
    const reference = createCardoraPaymentReference();
    const [payment] = await db.insert(subscriptionPayments).values({
      ownerId: ctx.user.id, planId: plan.id, reference, amountMinor: plan.priceMinor,
      currency: plan.currency, billingInterval: plan.billingInterval, status: "initializing", providerChannel: "card",
    }).returning({ id: subscriptionPayments.id });
    try {
      const checkout = await paystack.initializeCardTransaction({
        email: owner.email, amount: plan.priceMinor, currency: "KES", reference,
        callbackUrl: getPaystackConfig()!.callbackUrl,
        metadata: JSON.stringify({ paymentId: payment.id, ownerId: ctx.user.id, planId: plan.id }),
      });
      await db.update(subscriptionPayments).set({ accessCode: checkout.accessCode, status: "pending" }).where(eq(subscriptionPayments.id, payment.id));
      return { reference, accessCode: checkout.accessCode, planName: plan.name, amountMinor: plan.priceMinor, currency: plan.currency };
    } catch (error) {
      await db.update(subscriptionPayments).set({ status: "failed" }).where(eq(subscriptionPayments.id, payment.id));
      throw error;
    }
  }),

  startStk: protectedProcedure.input(planInput.extend({ phone: z.string().trim().min(6).max(40) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const paystack = requirePaystack();
    const [owner] = await db.select({ id: users.id, email: users.emailAuthEmail }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!owner?.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add an email address to your account before paying." });
    let phone: ReturnType<typeof normalizePhone>;
    try { phone = normalizePhone(input.phone); }
    catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid phone number with its country calling code." }); }
    if (phone.countryCode !== "KE") throw new TRPCError({ code: "BAD_REQUEST", message: "M-Pesa STK Push is available for Kenyan phone numbers." });
    const [plan] = await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.id, input.planId), eq(subscriptionPlans.isActive, true))).limit(1);
    if (!plan || plan.priceMinor <= 0 || plan.currency !== "KES") throw new TRPCError({ code: "NOT_FOUND", message: "This plan is not available for M-Pesa payments." });
    const reference = createCardoraPaymentReference();
    const [payment] = await db.insert(subscriptionPayments).values({
      ownerId: ctx.user.id, planId: plan.id, reference, amountMinor: plan.priceMinor,
      currency: plan.currency, billingInterval: plan.billingInterval, status: "initializing", providerChannel: "mobile_money",
    }).returning({ id: subscriptionPayments.id });
    try {
      const charge = await paystack.chargeMobileMoney({ email: owner.email, amount: plan.priceMinor, currency: "KES", reference, phone: phone.phoneE164 });
      if (charge.reference !== reference) throw new Error("Payment reference mismatch");
      await db.update(subscriptionPayments).set({ status: "pending" }).where(eq(subscriptionPayments.id, payment.id));
      return { reference, status: charge.status, displayText: charge.display_text ?? "Check your phone and approve the M-Pesa payment request." };
    } catch (error) {
      await db.update(subscriptionPayments).set({ status: "failed" }).where(eq(subscriptionPayments.id, payment.id));
      throw error;
    }
  }),

  verify: protectedProcedure.input(z.object({ reference: z.string().regex(/^CARDORA[0-9a-f]{32}$/i) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const [payment] = await db.select().from(subscriptionPayments).where(and(
      eq(subscriptionPayments.reference, input.reference), eq(subscriptionPayments.ownerId, ctx.user.id),
    )).limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    if (payment.status === "paid") return { status: "paid" as const, message: "Your plan is active." };
    if (payment.status === "failed") return { status: "failed" as const, message: "This payment was not completed. Start a new checkout to try again." };

    if (payment.providerChannel === "mobile_money") {
      const sinceLastCheck = Date.now() - payment.updatedAt.getTime();
      if (sinceLastCheck < 10_000) {
        return { status: "pending" as const, message: "M-Pesa can take a moment to respond. Wait a few seconds before checking again." };
      }
      await db.update(subscriptionPayments).set({ updatedAt: new Date() }).where(and(
        eq(subscriptionPayments.id, payment.id), eq(subscriptionPayments.status, "pending"),
      ));
    }

    const config = getPaystackConfig();
    if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment verification is not configured on this server yet." });
    const paystack = createPaystackClient(config);
    let actual;
    try {
      actual = payment.providerChannel === "mobile_money"
        ? await paystack.checkCharge(payment.reference)
        : await paystack.verifyTransaction(payment.reference);
    } catch {
      return { status: "pending" as const, message: "Paystack is still confirming your payment. Please check again shortly." };
    }
    if (actual.status !== "success") {
      if (["failed", "abandoned", "reversed"].includes(actual.status)) {
        await db.update(subscriptionPayments).set({ status: "failed" }).where(and(eq(subscriptionPayments.id, payment.id), eq(subscriptionPayments.status, "pending")));
        return { status: "failed" as const, message: "This payment was not completed. Start a new checkout to try again." };
      }
      return { status: "pending" as const, message: "Approve the payment on your phone, then check again." };
    }
    if (!verifiedTransactionMatches({ reference: payment.reference, amountMinor: payment.amountMinor, currency: payment.currency }, actual)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The payment details could not be verified. Contact Cardora support with your payment reference." });
    }

    const now = new Date();
    const periodEnd = addBillingInterval(now, payment.billingInterval);
    await db.transaction(async tx => {
      const [lockedPayment] = await tx.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, payment.id)).limit(1).for("update");
      if (!lockedPayment || lockedPayment.status === "paid") return;
      if (lockedPayment.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This payment is no longer pending." });
      await tx.update(subscriptionPayments).set({ status: "paid", paidAt: now, periodStartAt: now, periodEndAt: periodEnd }).where(eq(subscriptionPayments.id, payment.id));
      const values = {
        planId: payment.planId, status: "active" as const, source: "paystack" as const,
        currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, assignedBy: null,
      };
      await tx.insert(ownerSubscriptions).values({ ownerId: ctx.user.id, ...values }).onConflictDoUpdate({
        target: ownerSubscriptions.ownerId, set: values,
      });
    });
    return { status: "paid" as const, message: "Payment confirmed. Your plan is now active." };
  }),
});
