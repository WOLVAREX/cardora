CREATE TABLE `cardora_owner_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','past_due','canceled','expired') NOT NULL DEFAULT 'active',
	`source` enum('admin','paystack') NOT NULL DEFAULT 'admin',
	`paystackCustomerCode` varchar(80),
	`paystackSubscriptionCode` varchar(80),
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`assignedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cardora_owner_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_owner_subscriptions_owner_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `cardora_subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`contactLimit` int NOT NULL,
	`collectionLimit` int NOT NULL,
	`priceMinor` int NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`billingInterval` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`paystackPlanCode` varchar(80),
	`isActive` boolean NOT NULL DEFAULT true,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
		CONSTRAINT `cardora_subscription_plans_id` PRIMARY KEY(`id`),
		CONSTRAINT `cardora_subscription_plans_code_unique` UNIQUE(`code`)
	);
	--> statement-breakpoint
	INSERT IGNORE INTO `cardora_subscription_plans` (`code`, `name`, `description`, `contactLimit`, `collectionLimit`, `priceMinor`, `currency`, `billingInterval`, `isActive`, `isDefault`)
	VALUES ('free', 'Free', 'The default Cardora plan: up to 100 accepted contacts and 1 collection link.', 100, 1, 0, 'KES', 'monthly', true, true);
	--> statement-breakpoint
	CREATE INDEX `cardora_owner_subscriptions_plan_idx` ON `cardora_owner_subscriptions` (`planId`);--> statement-breakpoint
CREATE INDEX `cardora_owner_subscriptions_paystack_idx` ON `cardora_owner_subscriptions` (`paystackSubscriptionCode`);--> statement-breakpoint
CREATE INDEX `cardora_subscription_plans_active_idx` ON `cardora_subscription_plans` (`isActive`);--> statement-breakpoint
CREATE INDEX `cardora_subscription_plans_default_idx` ON `cardora_subscription_plans` (`isDefault`);
