CREATE TABLE `cardora_gmail_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`gmailAddress` varchar(320) NOT NULL,
	`encryptedRefreshToken` text NOT NULL,
	`tokenIv` varchar(32) NOT NULL,
	`tokenTag` varchar(32) NOT NULL,
	`grantedScopes` text,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cardora_gmail_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_gmail_connections_owner_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `cardora_gmail_oauth_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`stateDigest` varchar(64) NOT NULL,
	`codeVerifier` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardora_gmail_oauth_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_gmail_oauth_states_stateDigest_unique` UNIQUE(`stateDigest`)
);
--> statement-breakpoint
CREATE TABLE `cardora_phone_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`phoneE164` varchar(24) NOT NULL,
	`codeDigest` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`verifiedAt` timestamp,
	CONSTRAINT `cardora_phone_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cardora_campaigns` MODIFY COLUMN `status` enum('not_sent','sending','queued','partial','failed') NOT NULL DEFAULT 'not_sent';--> statement-breakpoint
ALTER TABLE `cardora_campaigns` ADD `queuedRecipientCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cardora_campaigns` ADD `skippedRecipientCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cardora_campaigns` ADD `providerMessageIds` text;--> statement-breakpoint
ALTER TABLE `cardora_campaigns` ADD `failureReason` varchar(240);--> statement-breakpoint
ALTER TABLE `cardora_campaigns` ADD `sentAt` timestamp;--> statement-breakpoint
CREATE INDEX `cardora_gmail_oauth_owner_idx` ON `cardora_gmail_oauth_states` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cardora_phone_verifications_owner_idx` ON `cardora_phone_verifications` (`ownerId`,`sentAt`);