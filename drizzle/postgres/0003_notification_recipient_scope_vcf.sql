ALTER TABLE "cardora_contacts"
  ADD COLUMN "vcfOptIn" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cardora_campaigns"
  ADD COLUMN "recipientContactIds" jsonb,
  ADD COLUMN "vcfDownloadTokenHash" varchar(64),
  ADD COLUMN "vcfDownloadExpiresAt" timestamp;
