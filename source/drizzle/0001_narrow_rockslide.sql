CREATE TABLE `access_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`clubId` int NOT NULL,
	`accessRequestId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `access_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_grants_player_club_unique` UNIQUE(`playerId`,`clubId`)
);
--> statement-breakpoint
CREATE TABLE `access_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`academyId` int NOT NULL,
	`clubId` int NOT NULL,
	`status` enum('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending',
	`message` varchar(500) NOT NULL DEFAULT '',
	`reason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`videoId` int,
	`skill` varchar(60) NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT true,
	`score` double NOT NULL,
	`metrics` json NOT NULL,
	`jointAngles` json NOT NULL,
	`observations` json NOT NULL,
	`exercises` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int,
	`actorUserId` int,
	`entityType` varchar(60) NOT NULL,
	`entityId` int,
	`action` varchar(100) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clubId` int NOT NULL,
	`playerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorites_club_player_unique` UNIQUE(`clubId`,`playerId`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','staff') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberships_organization_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`organizationId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`text` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` enum('academy','club') NOT NULL,
	`region` varchar(120) NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`demoOwnerUserId` int,
	`demoSeededAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_demo_owner_type_unique` UNIQUE(`demoOwnerUserId`,`type`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`academyId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`age` int NOT NULL,
	`nationality` varchar(80) NOT NULL,
	`position` varchar(40) NOT NULL,
	`foot` varchar(30) NOT NULL,
	`height` int NOT NULL,
	`weight` double NOT NULL,
	`region` varchar(120) NOT NULL,
	`birthDate` varchar(10) NOT NULL DEFAULT '',
	`jersey` int NOT NULL,
	`photoKey` varchar(255) NOT NULL DEFAULT '',
	`overall` double NOT NULL DEFAULT 0,
	`improvement` double NOT NULL DEFAULT 0,
	`discoverable` boolean NOT NULL DEFAULT false,
	`strengths` json NOT NULL,
	`weaknesses` json NOT NULL,
	`skills` json NOT NULL,
	`physicalTests` json NOT NULL,
	`history` json NOT NULL,
	`lastAnalysisAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`data` mediumblob NOT NULL,
	CONSTRAINT `video_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_chunks_video_index_unique` UNIQUE(`videoId`,`chunkIndex`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`skill` varchar(60) NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`size` int NOT NULL,
	`mime` varchar(30) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_clubId_organizations_id_fk` FOREIGN KEY (`clubId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_grants` ADD CONSTRAINT `access_grants_accessRequestId_access_requests_id_fk` FOREIGN KEY (`accessRequestId`) REFERENCES `access_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_academyId_organizations_id_fk` FOREIGN KEY (`academyId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_clubId_organizations_id_fk` FOREIGN KEY (`clubId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analyses` ADD CONSTRAINT `analyses_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `analyses` ADD CONSTRAINT `analyses_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_clubId_organizations_id_fk` FOREIGN KEY (`clubId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_demoOwnerUserId_users_id_fk` FOREIGN KEY (`demoOwnerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `players` ADD CONSTRAINT `players_academyId_organizations_id_fk` FOREIGN KEY (`academyId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `video_chunks` ADD CONSTRAINT `video_chunks_videoId_videos_id_fk` FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videos` ADD CONSTRAINT `videos_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_grants_club_active_idx` ON `access_grants` (`clubId`,`active`);--> statement-breakpoint
CREATE INDEX `access_requests_academy_idx` ON `access_requests` (`academyId`,`status`);--> statement-breakpoint
CREATE INDEX `access_requests_club_idx` ON `access_requests` (`clubId`,`status`);--> statement-breakpoint
CREATE INDEX `access_requests_player_club_idx` ON `access_requests` (`playerId`,`clubId`);--> statement-breakpoint
CREATE INDEX `analyses_player_created_idx` ON `analyses` (`playerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_events_org_created_idx` ON `audit_events` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `favorites_club_idx` ON `favorites` (`clubId`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `notes_player_created_idx` ON `notes` (`playerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `players_academy_idx` ON `players` (`academyId`);--> statement-breakpoint
CREATE INDEX `players_discovery_idx` ON `players` (`discoverable`,`position`,`region`);--> statement-breakpoint
CREATE INDEX `videos_player_recorded_idx` ON `videos` (`playerId`,`recordedAt`);