CREATE TABLE `cardora_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`collectionId` int NOT NULL,
	`channel` enum('email','sms') NOT NULL,
	`subject` varchar(160) NOT NULL,
	`message` text NOT NULL,
	`eligibleRecipientCount` int NOT NULL DEFAULT 0,
	`status` enum('not_sent') NOT NULL DEFAULT 'not_sent',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardora_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cardora_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`slug` varchar(80) NOT NULL,
	`title` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`canonicalUrl` varchar(2048) NOT NULL,
	`allowedCountryCodes` json NOT NULL,
	`contactLimit` int NOT NULL,
	`usedSlots` int NOT NULL DEFAULT 0,
	`status` enum('open','full','paused') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cardora_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_collections_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `cardora_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`phoneE164` varchar(24) NOT NULL,
	`countryCode` varchar(2) NOT NULL,
	`email` varchar(320),
	`emailOptIn` boolean NOT NULL DEFAULT false,
	`smsOptIn` boolean NOT NULL DEFAULT false,
	`consentVersion` varchar(24) NOT NULL,
	`consentedAt` timestamp NOT NULL DEFAULT (now()),
	`unsubscribeToken` varchar(64) NOT NULL,
	`status` enum('accepted','removed') NOT NULL DEFAULT 'accepted',
	`unsubscribedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardora_contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_contacts_unsubscribeToken_unique` UNIQUE(`unsubscribeToken`),
	CONSTRAINT `cardora_contacts_collection_phone_unique` UNIQUE(`collectionId`,`phoneE164`)
);
--> statement-breakpoint
CREATE TABLE `cardora_owner_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`collectionId` int NOT NULL,
	`kind` enum('capacity_reached') NOT NULL DEFAULT 'capacity_reached',
	`message` varchar(240) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardora_owner_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phoneE164` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `phoneCountryCode` varchar(2);--> statement-breakpoint
ALTER TABLE `users` ADD `phoneVerifiedAt` timestamp;--> statement-breakpoint
CREATE INDEX `cardora_campaigns_owner_idx` ON `cardora_campaigns` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cardora_collections_owner_idx` ON `cardora_collections` (`ownerId`);--> statement-breakpoint
CREATE INDEX `cardora_contacts_collection_idx` ON `cardora_contacts` (`collectionId`);--> statement-breakpoint
CREATE INDEX `cardora_alerts_owner_idx` ON `cardora_owner_alerts` (`ownerId`,`createdAt`);