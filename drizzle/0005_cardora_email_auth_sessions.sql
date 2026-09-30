CREATE TABLE `cardora_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardora_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardora_sessions_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `emailAuthEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_auth_email_unique` UNIQUE(`emailAuthEmail`);--> statement-breakpoint
CREATE INDEX `cardora_sessions_user_idx` ON `cardora_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `cardora_sessions_expiry_idx` ON `cardora_sessions` (`expiresAt`);