CREATE TABLE "cardora_owner_quota_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"contactLimit" integer,
	"collectionLimit" integer,
	"maxContactsPerCollection" integer,
	"updatedBy" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cardora_owner_quota_overrides_owner_unique" ON "cardora_owner_quota_overrides" USING btree ("ownerId");