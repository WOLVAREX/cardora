import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "yearly"]);
export const ownerSubscriptionStatusEnum = pgEnum("owner_subscription_status", ["active", "past_due", "canceled", "expired"]);
export const subscriptionSourceEnum = pgEnum("subscription_source", ["admin", "paystack"]);
export const paymentStatusEnum = pgEnum("payment_status", ["initializing", "pending", "paid", "failed"]);
export const collectionStatusEnum = pgEnum("collection_status", ["open", "full", "paused"]);
export const contactStatusEnum = pgEnum("contact_status", ["accepted", "removed"]);
export const alertKindEnum = pgEnum("owner_alert_kind", ["capacity_reached", "account_limit_reached"]);
export const campaignChannelEnum = pgEnum("campaign_channel", ["email", "sms"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["not_sent", "sending", "queued", "partial", "failed"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Preserved only for legacy accounts previously linked through Manus OAuth. */
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Normalized email reserved for Cardora password authentication. */
  emailAuthEmail: varchar("emailAuthEmail", { length: 320 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  /** Scrypt hash; never returned by an API or stored in a browser. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  phoneE164: varchar("phoneE164", { length: 24 }),
  phoneCountryCode: varchar("phoneCountryCode", { length: 2 }),
  phoneVerifiedAt: timestamp("phoneVerifiedAt"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => ({
  emailAuthEmailUnique: uniqueIndex("users_email_auth_email_unique").on(table.emailAuthEmail),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "phoneE164" | "phoneCountryCode" | "phoneVerifiedAt" | "emailVerifiedAt">;

/** Opaque session tokens are stored only as digests and can be revoked server-side. */
export const sessions = pgTable("cardora_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  tokenHashUnique: uniqueIndex("cardora_sessions_token_hash_unique").on(table.tokenHash),
  userIndex: index("cardora_sessions_user_idx").on(table.userId),
  expiryIndex: index("cardora_sessions_expiry_idx").on(table.expiresAt),
}));

/** Admin-editable plans define account-wide quotas as well as paid price metadata. */
export const subscriptionPlans = pgTable("cardora_subscription_plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  contactLimit: integer("contactLimit").notNull(),
  collectionLimit: integer("collectionLimit").notNull(),
  priceMinor: integer("priceMinor").default(0).notNull(),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  billingInterval: billingIntervalEnum("billingInterval").default("monthly").notNull(),
  paystackPlanCode: varchar("paystackPlanCode", { length: 80 }),
  isActive: boolean("isActive").default(true).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  codeUnique: uniqueIndex("cardora_subscription_plans_code_unique").on(table.code),
  activeIndex: index("cardora_subscription_plans_active_idx").on(table.isActive),
  defaultIndex: index("cardora_subscription_plans_default_idx").on(table.isDefault),
}));
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

/** One current assignment per owner. A missing/expired assignment resolves to the default plan. */
export const ownerSubscriptions = pgTable("cardora_owner_subscriptions", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  planId: integer("planId").notNull(),
  status: ownerSubscriptionStatusEnum("status").default("active").notNull(),
  source: subscriptionSourceEnum("source").default("admin").notNull(),
  paystackCustomerCode: varchar("paystackCustomerCode", { length: 80 }),
  paystackSubscriptionCode: varchar("paystackSubscriptionCode", { length: 80 }),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  assignedBy: integer("assignedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  ownerUnique: uniqueIndex("cardora_owner_subscriptions_owner_unique").on(table.ownerId),
  planIndex: index("cardora_owner_subscriptions_plan_idx").on(table.planId),
  providerSubscriptionIndex: index("cardora_owner_subscriptions_paystack_idx").on(table.paystackSubscriptionCode),
}));
export type OwnerSubscription = typeof ownerSubscriptions.$inferSelect;

/** Optional per-owner limits set by Cardora support, on top of the assigned plan. */
export const ownerQuotaOverrides = pgTable("cardora_owner_quota_overrides", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  contactLimit: integer("contactLimit"),
  collectionLimit: integer("collectionLimit"),
  maxContactsPerCollection: integer("maxContactsPerCollection"),
  updatedBy: integer("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({ ownerUnique: uniqueIndex("cardora_owner_quota_overrides_owner_unique").on(table.ownerId) }));
export type OwnerQuotaOverride = typeof ownerQuotaOverrides.$inferSelect;

/** One-time Paystack checkouts; card details and reusable authorizations are never stored. */
export const subscriptionPayments = pgTable("cardora_subscription_payments", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  planId: integer("planId").notNull(),
  reference: varchar("reference", { length: 48 }).notNull(),
  amountMinor: integer("amountMinor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  billingInterval: billingIntervalEnum("billingInterval").notNull(),
  status: paymentStatusEnum("status").default("initializing").notNull(),
  authorizationUrl: varchar("authorizationUrl", { length: 2048 }),
  accessCode: varchar("accessCode", { length: 160 }),
  providerChannel: varchar("providerChannel", { length: 40 }),
  paidAt: timestamp("paidAt"),
  periodStartAt: timestamp("periodStartAt"),
  periodEndAt: timestamp("periodEndAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  referenceUnique: uniqueIndex("cardora_subscription_payments_reference_unique").on(table.reference),
  ownerCreatedIndex: index("cardora_subscription_payments_owner_created_idx").on(table.ownerId, table.createdAt),
  ownerStatusIndex: index("cardora_subscription_payments_owner_status_idx").on(table.ownerId, table.status),
  statusCreatedIndex: index("cardora_subscription_payments_status_created_idx").on(table.status, table.createdAt),
}));
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

export const collections = pgTable("cardora_collections", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  slug: varchar("slug", { length: 80 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull(),
  canonicalUrl: varchar("canonicalUrl", { length: 2048 }).notNull(),
  allowedCountryCodes: jsonb("allowedCountryCodes").$type<string[]>().notNull(),
  contactLimit: integer("contactLimit").notNull(),
  usedSlots: integer("usedSlots").default(0).notNull(),
  status: collectionStatusEnum("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  slugUnique: uniqueIndex("cardora_collections_slug_unique").on(table.slug),
  ownerIndex: index("cardora_collections_owner_idx").on(table.ownerId),
}));
export type Collection = typeof collections.$inferSelect;

export const contacts = pgTable("cardora_contacts", {
  id: serial("id").primaryKey(),
  collectionId: integer("collectionId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phoneE164: varchar("phoneE164", { length: 24 }).notNull(),
  countryCode: varchar("countryCode", { length: 2 }).notNull(),
  email: varchar("email", { length: 320 }),
  emailOptIn: boolean("emailOptIn").default(false).notNull(),
  smsOptIn: boolean("smsOptIn").default(false).notNull(),
  vcfOptIn: boolean("vcfOptIn").default(false).notNull(),
  consentVersion: varchar("consentVersion", { length: 24 }).notNull(),
  consentedAt: timestamp("consentedAt").defaultNow().notNull(),
  unsubscribeToken: varchar("unsubscribeToken", { length: 64 }).notNull().unique(),
  status: contactStatusEnum("status").default("accepted").notNull(),
  unsubscribedAt: timestamp("unsubscribedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  phoneUnique: uniqueIndex("cardora_contacts_collection_phone_unique").on(table.collectionId, table.phoneE164),
  collectionIndex: index("cardora_contacts_collection_idx").on(table.collectionId),
}));
export type Contact = typeof contacts.$inferSelect;

export const ownerAlerts = pgTable("cardora_owner_alerts", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  collectionId: integer("collectionId").notNull(),
  kind: alertKindEnum("kind").default("capacity_reached").notNull(),
  message: varchar("message", { length: 240 }).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ ownerIndex: index("cardora_alerts_owner_idx").on(table.ownerId, table.createdAt) }));

export const campaigns = pgTable("cardora_campaigns", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  collectionId: integer("collectionId").notNull(),
  channel: campaignChannelEnum("channel").notNull(),
  subject: varchar("subject", { length: 160 }).notNull(),
  message: text("message").notNull(),
  eligibleRecipientCount: integer("eligibleRecipientCount").default(0).notNull(),
  recipientContactIds: jsonb("recipientContactIds").$type<number[]>(),
  vcfDownloadTokenHash: varchar("vcfDownloadTokenHash", { length: 64 }),
  vcfDownloadExpiresAt: timestamp("vcfDownloadExpiresAt"),
  recipientSnapshotHash: varchar("recipientSnapshotHash", { length: 64 }),
  status: campaignStatusEnum("status").default("not_sent").notNull(),
  queuedRecipientCount: integer("queuedRecipientCount").default(0).notNull(),
  skippedRecipientCount: integer("skippedRecipientCount").default(0).notNull(),
  providerMessageIds: text("providerMessageIds"),
  failureReason: varchar("failureReason", { length: 240 }),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ ownerIndex: index("cardora_campaigns_owner_idx").on(table.ownerId, table.createdAt) }));

export const phoneVerifications = pgTable("cardora_phone_verifications", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  phoneE164: varchar("phoneE164", { length: 24 }).notNull(),
  codeDigest: varchar("codeDigest", { length: 64 }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  verifiedAt: timestamp("verifiedAt"),
}, table => ({ ownerIndex: index("cardora_phone_verifications_owner_idx").on(table.ownerId, table.sentAt) }));

export const emailVerifications = pgTable("cardora_email_verifications", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ tokenUnique: uniqueIndex("cardora_email_verifications_token_unique").on(table.tokenHash), ownerIndex: index("cardora_email_verifications_owner_idx").on(table.ownerId, table.createdAt) }));

export const gmailConnections = pgTable("cardora_gmail_connections", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  gmailAddress: varchar("gmailAddress", { length: 320 }).notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
  tokenIv: varchar("tokenIv", { length: 32 }).notNull(),
  tokenTag: varchar("tokenTag", { length: 32 }).notNull(),
  grantedScopes: text("grantedScopes"),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({ ownerUnique: uniqueIndex("cardora_gmail_connections_owner_unique").on(table.ownerId) }));

export const gmailOauthStates = pgTable("cardora_gmail_oauth_states", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  stateDigest: varchar("stateDigest", { length: 64 }).notNull().unique(),
  codeVerifier: varchar("codeVerifier", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ ownerIndex: index("cardora_gmail_oauth_owner_idx").on(table.ownerId, table.createdAt) }));
