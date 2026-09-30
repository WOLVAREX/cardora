CREATE TABLE `cardora_subscription_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`planId` int NOT NULL,
	`reference` varchar(48) NOT NULL,
	`amountMinor` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`billingInterval` enum('monthly','yearly') NOT NULL,
	`status` enum('initializing','pending','paid','failed') NOT NULL DEFAULT 'initializing',
	`authorizationUrl` varchar(2048),
	`accessCode` varchar(160),
	`providerChannel` varchar(40),
	`paidAt` timestamp,
	`periodStartAt` timestamp,
	`periodEndAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cardora_subscription_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_subscription_payments_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE INDEX `cardora_subscription_payments_owner_created_idx` ON `cardora_subscription_payments` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `cardora_subscription_payments_owner_status_idx` ON `cardora_subscription_payments` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `cardora_subscription_payments_status_created_idx` ON `cardora_subscription_payments` (`status`,`createdAt`);