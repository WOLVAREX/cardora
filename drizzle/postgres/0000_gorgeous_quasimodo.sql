CREATE TABLE "cardora_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"collectionId" integer NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"subject" varchar(160) NOT NULL,
	"message" text NOT NULL,
	"eligibleRecipientCount" integer DEFAULT 0 NOT NULL,
	"recipientSnapshotHash" varchar(64),
	"status" "campaign_status" DEFAULT 'not_sent' NOT NULL,
	"queuedRecipientCount" integer DEFAULT 0 NOT NULL,
	"skippedRecipientCount" integer DEFAULT 0 NOT NULL,
	"providerMessageIds" text,
	"failureReason" varchar(240),
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"canonicalUrl" varchar(2048) NOT NULL,
	"allowedCountryCodes" jsonb NOT NULL,
	"contactLimit" integer NOT NULL,
	"usedSlots" integer DEFAULT 0 NOT NULL,
	"status" "collection_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"collectionId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phoneE164" varchar(24) NOT NULL,
	"countryCode" varchar(2) NOT NULL,
	"email" varchar(320),
	"emailOptIn" boolean DEFAULT false NOT NULL,
	"smsOptIn" boolean DEFAULT false NOT NULL,
	"consentVersion" varchar(24) NOT NULL,
	"consentedAt" timestamp DEFAULT now() NOT NULL,
	"unsubscribeToken" varchar(64) NOT NULL,
	"status" "contact_status" DEFAULT 'accepted' NOT NULL,
	"unsubscribedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cardora_contacts_unsubscribeToken_unique" UNIQUE("unsubscribeToken")
);
--> statement-breakpoint
CREATE TABLE "cardora_gmail_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"gmailAddress" varchar(320) NOT NULL,
	"encryptedRefreshToken" text NOT NULL,
	"tokenIv" varchar(32) NOT NULL,
	"tokenTag" varchar(32) NOT NULL,
	"grantedScopes" text,
	"connectedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_gmail_oauth_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"stateDigest" varchar(64) NOT NULL,
	"codeVerifier" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cardora_gmail_oauth_states_stateDigest_unique" UNIQUE("stateDigest")
);
--> statement-breakpoint
CREATE TABLE "cardora_owner_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"collectionId" integer NOT NULL,
	"kind" "owner_alert_kind" DEFAULT 'capacity_reached' NOT NULL,
	"message" varchar(240) NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_owner_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"planId" integer NOT NULL,
	"status" "owner_subscription_status" DEFAULT 'active' NOT NULL,
	"source" "subscription_source" DEFAULT 'admin' NOT NULL,
	"paystackCustomerCode" varchar(80),
	"paystackSubscriptionCode" varchar(80),
	"currentPeriodStart" timestamp,
	"currentPeriodEnd" timestamp,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"assignedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_phone_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"phoneE164" varchar(24) NOT NULL,
	"codeDigest" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"verifiedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "cardora_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_subscription_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"planId" integer NOT NULL,
	"reference" varchar(48) NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"billingInterval" "billing_interval" NOT NULL,
	"status" "payment_status" DEFAULT 'initializing' NOT NULL,
	"authorizationUrl" varchar(2048),
	"accessCode" varchar(160),
	"providerChannel" varchar(40),
	"paidAt" timestamp,
	"periodStartAt" timestamp,
	"periodEndAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardora_subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"contactLimit" integer NOT NULL,
	"collectionLimit" integer NOT NULL,
	"priceMinor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'KES' NOT NULL,
	"billingInterval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"paystackPlanCode" varchar(80),
	"isActive" boolean DEFAULT true NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64),
	"name" text,
	"email" varchar(320),
	"emailAuthEmail" varchar(320),
	"passwordHash" varchar(255),
	"notificationEmail" varchar(320),
	"loginMethod" varchar(64),
	"phoneE164" varchar(24),
	"phoneCountryCode" varchar(2),
	"phoneVerifiedAt" timestamp,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "cardora_campaigns_owner_idx" ON "cardora_campaigns" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_collections_slug_unique" ON "cardora_collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cardora_collections_owner_idx" ON "cardora_collections" USING btree ("ownerId");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_contacts_collection_phone_unique" ON "cardora_contacts" USING btree ("collectionId","phoneE164");--> statement-breakpoint
CREATE INDEX "cardora_contacts_collection_idx" ON "cardora_contacts" USING btree ("collectionId");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_gmail_connections_owner_unique" ON "cardora_gmail_connections" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "cardora_gmail_oauth_owner_idx" ON "cardora_gmail_oauth_states" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "cardora_alerts_owner_idx" ON "cardora_owner_alerts" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_owner_subscriptions_owner_unique" ON "cardora_owner_subscriptions" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "cardora_owner_subscriptions_plan_idx" ON "cardora_owner_subscriptions" USING btree ("planId");--> statement-breakpoint
CREATE INDEX "cardora_owner_subscriptions_paystack_idx" ON "cardora_owner_subscriptions" USING btree ("paystackSubscriptionCode");--> statement-breakpoint
CREATE INDEX "cardora_phone_verifications_owner_idx" ON "cardora_phone_verifications" USING btree ("ownerId","sentAt");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_sessions_token_hash_unique" ON "cardora_sessions" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "cardora_sessions_user_idx" ON "cardora_sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "cardora_sessions_expiry_idx" ON "cardora_sessions" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_subscription_payments_reference_unique" ON "cardora_subscription_payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "cardora_subscription_payments_owner_created_idx" ON "cardora_subscription_payments" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "cardora_subscription_payments_owner_status_idx" ON "cardora_subscription_payments" USING btree ("ownerId","status");--> statement-breakpoint
CREATE INDEX "cardora_subscription_payments_status_created_idx" ON "cardora_subscription_payments" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_subscription_plans_code_unique" ON "cardora_subscription_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cardora_subscription_plans_active_idx" ON "cardora_subscription_plans" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "cardora_subscription_plans_default_idx" ON "cardora_subscription_plans" USING btree ("isDefault");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_auth_email_unique" ON "users" USING btree ("emailAuthEmail");