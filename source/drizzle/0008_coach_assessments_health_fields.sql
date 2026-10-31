CREATE TABLE `coach_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`coachName` varchar(160) NOT NULL,
	`coachPhotoKey` varchar(255) NOT NULL DEFAULT '',
	`assessedAt` timestamp NOT NULL,
	`protocol` varchar(160) NOT NULL,
	`notes` varchar(2000) NOT NULL DEFAULT '',
	`skills` json NOT NULL,
	`overall` double,
	`strengths` json NOT NULL,
	`development` json NOT NULL,
	`exercises` json NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `player_health_profiles` ADD `chronicDiseases` varchar(2000) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `player_health_profiles` ADD `availableExams` varchar(2000) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `coach_assessments` ADD CONSTRAINT `coach_assessments_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coach_assessments_player_assessed_idx` ON `coach_assessments` (`playerId`,`assessedAt`);