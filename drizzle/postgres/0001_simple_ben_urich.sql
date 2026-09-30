CREATE TABLE "cardora_email_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_email_verifications_token_unique" ON "cardora_email_verifications" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "cardora_email_verifications_owner_idx" ON "cardora_email_verifications" USING btree ("ownerId","createdAt");