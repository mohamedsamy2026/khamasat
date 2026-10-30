
CREATE TABLE `academy_authority_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `academyId` int NOT NULL,
  `authorityId` int NOT NULL,
  `status` enum('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending',
  `approvedByUserId` int,
  `approvedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `academy_authority_links_id` PRIMARY KEY(`id`),
  CONSTRAINT `academy_authority_unique` UNIQUE(`academyId`,`authorityId`)
);
--> statement-breakpoint

CREATE TABLE `academy_licenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `academyId` int NOT NULL,
  `authorityId` int NOT NULL,
  `licenseNumber` varchar(100) NOT NULL,
  `issuedAt` timestamp NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `status` enum('active','suspended','revoked') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `academy_licenses_id` PRIMARY KEY(`id`),
  CONSTRAINT `academy_license_number_unique` UNIQUE(`authorityId`,`licenseNumber`)
);
--> statement-breakpoint

CREATE TABLE `authority_memberships` (
  `id` int AUTO_INCREMENT NOT NULL,
  `authorityId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('admin','reviewer','viewer') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `authority_memberships_id` PRIMARY KEY(`id`),
  CONSTRAINT `authority_memberships_unique` UNIQUE(`authorityId`,`userId`)
);
--> statement-breakpoint

CREATE TABLE `coach_licenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `coachId` int NOT NULL,
  `authorityId` int NOT NULL,
  `licenseNumber` varchar(100) NOT NULL,
  `issuedAt` timestamp NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `status` enum('active','suspended','revoked') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `coach_licenses_id` PRIMARY KEY(`id`),
  CONSTRAINT `coach_license_number_unique` UNIQUE(`authorityId`,`licenseNumber`)
);
--> statement-breakpoint

CREATE TABLE `coaches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `academyId` int NOT NULL,
  `name` varchar(160) NOT NULL,
  `email` varchar(320),
  `phone` varchar(30),
  `specialization` varchar(120) NOT NULL DEFAULT '',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `coaches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE `license_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `authorityId` int NOT NULL,
  `academyLicenseId` int,
  `coachLicenseId` int,
  `notificationType` enum('expiring_soon','expired') NOT NULL,
  `recipientUserId` int NOT NULL,
  `message` text NOT NULL,
  `isRead` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `license_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE `regulatory_authorities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(180) NOT NULL,
  `code` varchar(40) NOT NULL,
  `region` varchar(120) NOT NULL,
  `status` enum('active','suspended') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `regulatory_authorities_id` PRIMARY KEY(`id`),
  CONSTRAINT `regulatory_authorities_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint

CREATE TABLE `regulatory_reports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `academyId` int NOT NULL,
  `authorityId` int NOT NULL,
  `title` varchar(220) NOT NULL,
  `reportType` enum('performance','compliance','annual','other') NOT NULL,
  `content` json NOT NULL,
  `status` enum('submitted','under_review','reviewed','returned') NOT NULL DEFAULT 'submitted',
  `submittedByUserId` int,
  `reviewedByUserId` int,
  `reviewedAt` timestamp,
  `submittedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `regulatory_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

ALTER TABLE `academy_authority_links`
  ADD CONSTRAINT `academy_authority_links_academyId_organizations_id_fk`
  FOREIGN KEY (`academyId`)
  REFERENCES `organizations`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `academy_authority_links`
  ADD CONSTRAINT `academy_authority_links_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `academy_authority_links`
  ADD CONSTRAINT `academy_authority_links_approvedByUserId_users_id_fk`
  FOREIGN KEY (`approvedByUserId`)
  REFERENCES `users`(`id`)
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `academy_licenses`
  ADD CONSTRAINT `academy_licenses_academyId_organizations_id_fk`
  FOREIGN KEY (`academyId`)
  REFERENCES `organizations`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `academy_licenses`
  ADD CONSTRAINT `academy_licenses_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `authority_memberships`
  ADD CONSTRAINT `authority_memberships_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `authority_memberships`
  ADD CONSTRAINT `authority_memberships_userId_users_id_fk`
  FOREIGN KEY (`userId`)
  REFERENCES `users`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `coach_licenses`
  ADD CONSTRAINT `coach_licenses_coachId_coaches_id_fk`
  FOREIGN KEY (`coachId`)
  REFERENCES `coaches`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `coach_licenses`
  ADD CONSTRAINT `coach_licenses_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `coaches`
  ADD CONSTRAINT `coaches_academyId_organizations_id_fk`
  FOREIGN KEY (`academyId`)
  REFERENCES `organizations`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `license_notifications`
  ADD CONSTRAINT `license_notifications_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `license_notifications`
  ADD CONSTRAINT `license_notifications_academyLicenseId_academy_licenses_id_fk`
  FOREIGN KEY (`academyLicenseId`)
  REFERENCES `academy_licenses`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `license_notifications`
  ADD CONSTRAINT `license_notifications_coachLicenseId_coach_licenses_id_fk`
  FOREIGN KEY (`coachLicenseId`)
  REFERENCES `coach_licenses`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `license_notifications`
  ADD CONSTRAINT `license_notifications_recipientUserId_users_id_fk`
  FOREIGN KEY (`recipientUserId`)
  REFERENCES `users`(`id`)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `regulatory_reports`
  ADD CONSTRAINT `regulatory_reports_academyId_organizations_id_fk`
  FOREIGN KEY (`academyId`)
  REFERENCES `organizations`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `regulatory_reports`
  ADD CONSTRAINT `regulatory_reports_authorityId_regulatory_authorities_id_fk`
  FOREIGN KEY (`authorityId`)
  REFERENCES `regulatory_authorities`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `regulatory_reports`
  ADD CONSTRAINT `regulatory_reports_submittedByUserId_users_id_fk`
  FOREIGN KEY (`submittedByUserId`)
  REFERENCES `users`(`id`)
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE `regulatory_reports`
  ADD CONSTRAINT `regulatory_reports_reviewedByUserId_users_id_fk`
  FOREIGN KEY (`reviewedByUserId`)
  REFERENCES `users`(`id`)
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX `academy_authority_status_idx`
  ON `academy_authority_links` (`authorityId`,`status`);
--> statement-breakpoint

CREATE INDEX `academy_licenses_expiry_idx`
  ON `academy_licenses` (`expiresAt`);
--> statement-breakpoint

CREATE INDEX `academy_licenses_academy_idx`
  ON `academy_licenses` (`academyId`);
--> statement-breakpoint

CREATE INDEX `authority_memberships_user_idx`
  ON `authority_memberships` (`userId`);
--> statement-breakpoint

CREATE INDEX `coach_licenses_coach_idx`
  ON `coach_licenses` (`coachId`);
--> statement-breakpoint

CREATE INDEX `coach_licenses_expiry_idx`
  ON `coach_licenses` (`expiresAt`);
--> statement-breakpoint

CREATE INDEX `coaches_academy_idx`
  ON `coaches` (`academyId`);
--> statement-breakpoint

CREATE INDEX `license_notifications_recipient_idx`
  ON `license_notifications` (`recipientUserId`,`isRead`);
--> statement-breakpoint

CREATE INDEX `regulatory_authorities_region_idx`
  ON `regulatory_authorities` (`region`);
--> statement-breakpoint

CREATE INDEX `regulatory_reports_authority_idx`
  ON `regulatory_reports` (`authorityId`,`submittedAt`);
--> statement-breakpoint

CREATE INDEX `regulatory_reports_academy_idx`
  ON `regulatory_reports` (`academyId`,`submittedAt`);
