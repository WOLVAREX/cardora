export const DEFAULT_FREE_PLAN = {
  code: "free",
  name: "Free",
  description: "The default Cardora plan: up to 100 accepted contacts and 1 collection link.",
  contactLimit: 100,
  collectionLimit: 1,
  priceMinor: 0,
  currency: "KES",
  billingInterval: "monthly" as const,
};

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "expired";
export type QuotaKind = "contacts" | "collections";

export interface SubscriptionPeriod {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

/** An assignment is usable only while explicitly active and before its paid-through date. */
export function isSubscriptionPeriodCurrent(assignment: SubscriptionPeriod | null | undefined, now = new Date()): boolean {
  if (!assignment || assignment.status !== "active") return false;
  return assignment.currentPeriodEnd === null || assignment.currentPeriodEnd.getTime() > now.getTime();
}

/** Preserve the stored lifecycle state while expiring an active assignment past its end date. */
export function getSubscriptionDisplayStatus(assignment: SubscriptionPeriod | null | undefined, now = new Date()): SubscriptionStatus | "free" {
  if (!assignment) return "free";
  if (assignment.status === "active" && assignment.currentPeriodEnd && assignment.currentPeriodEnd.getTime() <= now.getTime()) return "expired";
  return assignment.status;
}

/** Any active Paystack-managed assignment must be canceled through Paystack before manual replacement. */
export function isActivePaystackAssignment(assignment: { source: "admin" | "paystack"; status: SubscriptionStatus } | null | undefined): boolean {
  return assignment?.source === "paystack" && assignment.status === "active";
}

/** Capacity is available only when the current count is strictly below the plan limit. */
export function hasQuotaCapacity(used: number, limit: number): boolean {
  return Number.isSafeInteger(used) && Number.isSafeInteger(limit) && used >= 0 && limit >= 0 && used < limit;
}

export function remainingQuota(used: number, limit: number): number {
  if (!Number.isSafeInteger(used) || !Number.isSafeInteger(limit) || used < 0 || limit < 0) {
    throw new RangeError("Quota usage and limit must be non-negative safe integers.");
  }
  return Math.max(0, limit - used);
}

/** Convert a major-unit amount to the integer minor units required by Paystack. */
export function toMinorUnits(amount: number, currency: string): number {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency) || !Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Enter a valid non-negative amount and ISO currency code.");
  }
  if (!Intl.supportedValuesOf("currency").includes(normalizedCurrency)) {
    throw new RangeError("Enter a supported ISO currency code.");
  }
  let digits: number;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency: normalizedCurrency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new RangeError("Enter a supported ISO currency code.");
  }
  const factor = 10 ** digits;
  const minor = Math.round((amount + Number.EPSILON) * factor);
  if (!Number.isSafeInteger(minor) || minor > 2_000_000_000) {
    throw new RangeError("The plan price is above the supported maximum.");
  }
  return minor;
}

/** Convert provider/database minor units into a displayable major-unit decimal. */
export function fromMinorUnits(amountMinor: number, currency: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError("Amount must be a non-negative safe integer.");
  const normalizedCurrency = currency.trim().toUpperCase();
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: normalizedCurrency }).resolvedOptions().maximumFractionDigits ?? 2;
  return amountMinor / (10 ** digits);
}
