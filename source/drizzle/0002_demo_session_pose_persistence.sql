CREATE TABLE `demo_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`academyId` int NOT NULL,
	`clubId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `demo_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `analyses` MODIFY COLUMN `score` double;--> statement-breakpoint
ALTER TABLE `notes` MODIFY COLUMN `authorUserId` int;--> statement-breakpoint
ALTER TABLE `analyses` ADD `poseResult` json;--> statement-breakpoint
ALTER TABLE `demo_sessions` ADD CONSTRAINT `demo_sessions_academyId_organizations_id_fk` FOREIGN KEY (`academyId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `demo_sessions` ADD CONSTRAINT `demo_sessions_clubId_organizations_id_fk` FOREIGN KEY (`clubId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `demo_sessions_expiry_idx` ON `demo_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `demo_sessions_workspace_idx` ON `demo_sessions` (`academyId`,`clubId`);