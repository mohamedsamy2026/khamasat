CREATE TABLE `player_emergency_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`contactName` varchar(140) NOT NULL DEFAULT '',
	`relationship` varchar(80) NOT NULL DEFAULT '',
	`phone` varchar(32) NOT NULL DEFAULT '',
	`alternatePhone` varchar(32) NOT NULL DEFAULT '',
	`notes` varchar(500) NOT NULL DEFAULT '',
	`updatedByName` varchar(160) NOT NULL DEFAULT '',
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_emergency_contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_emergency_contacts_playerId_unique` UNIQUE(`playerId`)
);
--> statement-breakpoint
CREATE TABLE `player_health_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`previousInjuries` varchar(2000) NOT NULL DEFAULT '',
	`currentMedications` varchar(2000) NOT NULL DEFAULT '',
	`physiotherapy` varchar(2000) NOT NULL DEFAULT '',
	`otherNotes` varchar(2000) NOT NULL DEFAULT '',
	`updatedByName` varchar(160) NOT NULL DEFAULT '',
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_health_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_health_profiles_playerId_unique` UNIQUE(`playerId`)
);
--> statement-breakpoint
CREATE TABLE `player_physical_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`sport` varchar(40) NOT NULL DEFAULT 'football',
	`apparatus` varchar(40) NOT NULL DEFAULT '',
	`skill` varchar(80) NOT NULL DEFAULT '',
	`indicatorCode` varchar(120) NOT NULL,
	`indicatorLabel` varchar(160) NOT NULL,
	`indicatorGroup` varchar(80) NOT NULL DEFAULT '',
	`indicatorVersion` varchar(60) NOT NULL DEFAULT '',
	`value` double NOT NULL,
	`unit` varchar(20) NOT NULL,
	`note` varchar(500) NOT NULL DEFAULT '',
	`criterionStatus` varchar(40) NOT NULL DEFAULT 'provisional_unvalidated',
	`sessionKey` varchar(40) NOT NULL DEFAULT '',
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`authorName` varchar(160) NOT NULL DEFAULT '',
	`recordedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `player_physical_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_sensitive_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`organizationId` int NOT NULL,
	`scope` enum('health','emergency') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`grantedByUserId` int,
	`grantedByName` varchar(160) NOT NULL DEFAULT '',
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `player_sensitive_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_sensitive_grants_unique` UNIQUE(`playerId`,`organizationId`,`scope`)
);
--> statement-breakpoint
ALTER TABLE `notes` ADD `lastEditedByName` varchar(160) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `lastEditedByUserId` int;--> statement-breakpoint
ALTER TABLE `organizations` ADD `sports` json;--> statement-breakpoint
UPDATE `organizations` SET `sports` = JSON_ARRAY('football') WHERE `sports` IS NULL;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `sports` json NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `sport` varchar(40) DEFAULT 'football' NOT NULL;--> statement-breakpoint
UPDATE `players` SET `sport` = 'football' WHERE `sport` IS NULL OR `sport` = '';--> statement-breakpoint
ALTER TABLE `players` ADD `gymnasticsCategory` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `player_emergency_contacts` ADD CONSTRAINT `player_emergency_contacts_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_emergency_contacts` ADD CONSTRAINT `player_emergency_contacts_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_health_profiles` ADD CONSTRAINT `player_health_profiles_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_health_profiles` ADD CONSTRAINT `player_health_profiles_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_physical_assessments` ADD CONSTRAINT `player_physical_assessments_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_physical_assessments` ADD CONSTRAINT `player_physical_assessments_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_sensitive_grants` ADD CONSTRAINT `player_sensitive_grants_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_sensitive_grants` ADD CONSTRAINT `player_sensitive_grants_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_sensitive_grants` ADD CONSTRAINT `player_sensitive_grants_grantedByUserId_users_id_fk` FOREIGN KEY (`grantedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `player_physical_assessments_player_idx` ON `player_physical_assessments` (`playerId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `player_physical_assessments_apparatus_idx` ON `player_physical_assessments` (`playerId`,`sport`,`apparatus`);--> statement-breakpoint
CREATE INDEX `player_sensitive_grants_lookup_idx` ON `player_sensitive_grants` (`organizationId`,`scope`,`active`);--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_lastEditedByUserId_users_id_fk` FOREIGN KEY (`lastEditedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;