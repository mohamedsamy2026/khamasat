ALTER TABLE `videos` ADD `source` json;--> statement-breakpoint
CREATE INDEX `analyses_video_created_idx` ON `analyses` (`videoId`,`createdAt`);