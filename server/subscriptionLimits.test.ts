import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_PLAN, fromMinorUnits, getSubscriptionDisplayStatus, hasQuotaCapacity, isActivePaystackAssignment, isSubscriptionPeriodCurrent, remainingQuota, toMinorUnits } from "./subscriptionLimits";

describe("Cardora plan quotas", () => {
  it("defines the requested Free plan defaults", () => {
    expect(DEFAULT_FREE_PLAN).toMatchObject({ contactLimit: 100, collectionLimit: 5, priceMinor: 0, currency: "KES" });
  });

  it("allows usage strictly below the cap and stops exactly at the cap", () => {
    expect(hasQuotaCapacity(99, 100)).toBe(true);
    expect(hasQuotaCapacity(100, 100)).toBe(false);
    expect(hasQuotaCapacity(4, 5)).toBe(true);
    expect(hasQuotaCapacity(5, 5)).toBe(false);
    expect(hasQuotaCapacity(-1, 5)).toBe(false);
    expect(remainingQuota(102, 100)).toBe(0);
  });

  it("uses a paid assignment only while active and not past its end date", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    expect(isSubscriptionPeriodCurrent({ status: "active", currentPeriodEnd: null }, now)).toBe(true);
    expect(isSubscriptionPeriodCurrent({ status: "active", currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z") }, now)).toBe(true);
    expect(isSubscriptionPeriodCurrent({ status: "active", currentPeriodEnd: new Date("2026-09-30T12:00:00.000Z") }, now)).toBe(false);
    expect(isSubscriptionPeriodCurrent({ status: "past_due", currentPeriodEnd: null }, now)).toBe(false);
    expect(isSubscriptionPeriodCurrent(null, now)).toBe(false);
  });

  it("preserves stored non-current lifecycle states and protects any active Paystack assignment", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    expect(getSubscriptionDisplayStatus(null, now)).toBe("free");
    expect(getSubscriptionDisplayStatus({ status: "active", currentPeriodEnd: new Date("2026-09-30T11:00:00.000Z") }, now)).toBe("expired");
    expect(getSubscriptionDisplayStatus({ status: "canceled", currentPeriodEnd: null }, now)).toBe("canceled");
    expect(getSubscriptionDisplayStatus({ status: "expired", currentPeriodEnd: null }, now)).toBe("expired");
    expect(getSubscriptionDisplayStatus({ status: "past_due", currentPeriodEnd: null }, now)).toBe("past_due");
    expect(isActivePaystackAssignment({ source: "paystack", status: "active" })).toBe(true);
    expect(isActivePaystackAssignment({ source: "admin", status: "active" })).toBe(false);
    expect(isActivePaystackAssignment({ source: "paystack", status: "canceled" })).toBe(false);
  });

  it("converts amounts to and from provider minor units using currency precision", () => {
    expect(toMinorUnits(125.5, "KES")).toBe(12_550);
    expect(toMinorUnits(150, "JPY")).toBe(150);
    expect(fromMinorUnits(12_550, "KES")).toBe(125.5);
    expect(() => toMinorUnits(-1, "KES")).toThrow(RangeError);
    expect(() => toMinorUnits(1, "bad")).toThrow(RangeError);
  });
});
