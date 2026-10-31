ALTER TABLE `players` ADD `primaryApparatus` varchar(40);--> statement-breakpoint
ALTER TABLE `players` ADD `demoProfileKey` varchar(80);--> statement-breakpoint
ALTER TABLE `videos` ADD `demoAssetKey` varchar(160);--> statement-breakpoint
ALTER TABLE `videos` ADD `durationSeconds` int;--> statement-breakpoint
ALTER TABLE `videos` ADD `posterKey` varchar(255);
