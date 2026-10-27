CREATE TABLE `exercise_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`analysisId` int NOT NULL,
	`developmentId` varchar(200) NOT NULL,
	`name` varchar(200) NOT NULL,
	`goal` varchar(1000) NOT NULL,
	`steps` json NOT NULL,
	`tools` varchar(500) NOT NULL,
	`sets` int,
	`repetitions` int,
	`durationSeconds` int,
	`restSeconds` int,
	`progression` varchar(1000) NOT NULL,
	`reassessAt` varchar(40) NOT NULL,
	`reassessMethod` varchar(1000) NOT NULL,
	`reassessIndicatorCode` varchar(160) NOT NULL,
	`authorName` varchar(160) NOT NULL,
	`reviewed` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exercise_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `analyses` ADD `context` json;--> statement-breakpoint
ALTER TABLE `analyses` ADD `evaluationSnapshot` json;--> statement-breakpoint
ALTER TABLE `notes` ADD `analysisId` int;--> statement-breakpoint
ALTER TABLE `notes` ADD `source` enum('automatic','coach') DEFAULT 'coach' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `authorName` varchar(160) DEFAULT 'سجل تاريخي غير منسوب' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `requiredAction` varchar(500) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `visibility` enum('academy_internal','shared') DEFAULT 'academy_internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `originalText` varchar(1000) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `notes` SET `originalText` = `text` WHERE `originalText` = '';--> statement-breakpoint
ALTER TABLE `notes` ADD `revisions` json;--> statement-breakpoint
UPDATE `notes` SET `revisions` = JSON_ARRAY() WHERE `revisions` IS NULL;--> statement-breakpoint
ALTER TABLE `notes` MODIFY COLUMN `revisions` json NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `players` ADD `demoArchived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `players` AS p
INNER JOIN `organizations` AS o ON o.`id` = p.`academyId`
SET p.`demoArchived` = true
WHERE o.`isDemo` = true
  AND p.`name` IN ('خالد عبدالله', 'سعود أحمد', 'عبدالله خالد', 'فهد ناصر', 'ماجد علي', 'ملف تجريبي — عينة تسديد');--> statement-breakpoint
INSERT INTO `audit_events` (`organizationId`, `actorUserId`, `entityType`, `entityId`, `action`, `metadata`)
SELECT
  p.`academyId`,
  NULL,
  'player',
  p.`id`,
  'player.demo_archived',
  JSON_OBJECT(
    'reason', 'legacy_fake_demo_record_retained_not_deleted',
    'name', p.`name`,
    'legacyRaw', JSON_OBJECT(
      'overall', p.`overall`,
      'improvement', p.`improvement`,
      'skills', p.`skills`,
      'strengths', p.`strengths`,
      'weaknesses', p.`weaknesses`,
      'physicalTests', p.`physicalTests`,
      'history', p.`history`
    )
  )
FROM `players` AS p
INNER JOIN `organizations` AS o ON o.`id` = p.`academyId`
WHERE o.`isDemo` = true
  AND p.`name` IN ('خالد عبدالله', 'سعود أحمد', 'عبدالله خالد', 'فهد ناصر', 'ماجد علي', 'ملف تجريبي — عينة تسديد');--> statement-breakpoint
ALTER TABLE `exercise_plans` ADD CONSTRAINT `exercise_plans_playerId_players_id_fk` FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercise_plans` ADD CONSTRAINT `exercise_plans_analysisId_analyses_id_fk` FOREIGN KEY (`analysisId`) REFERENCES `analyses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `exercise_plans_player_updated_idx` ON `exercise_plans` (`playerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `exercise_plans_analysis_idx` ON `exercise_plans` (`analysisId`);--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_analysisId_analyses_id_fk` FOREIGN KEY (`analysisId`) REFERENCES `analyses`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notes_player_visibility_idx` ON `notes` (`playerId`,`visibility`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notes_analysis_idx` ON `notes` (`analysisId`);
