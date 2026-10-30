
import { z } from "zod";

export const positiveId = z.coerce.number().int().positive();

export const authorityInputSchema = z.object({
  name: z.string().trim().min(3).max(180),
  code: z.string().trim().min(2).max(40),
  region: z.string().trim().min(2).max(120),
});

export const authorityMembershipSchema = z.object({
  userId: positiveId,
  role: z.enum([
    "admin",
    "reviewer",
    "viewer",
  ]),
});

export const academyAuthorityLinkSchema = z.object({
  academyId: positiveId,
  authorityId: positiveId,
});

export const academyAuthorityActionSchema = z.object({
  action: z.enum([
    "approve",
    "reject",
    "revoke",
  ]),
});

export const coachInputSchema = z.object({
  academyId: positiveId,
  name: z.string().trim().min(2).max(160),
  email: z.string().email().max(320).optional(),
  phone: z.string().trim().max(30).optional(),
  specialization: z.string().trim().max(120),
});

export const licenseInputSchema = z.object({
  licenseNumber: z.string().trim().min(1).max(100),

  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
}).refine(
  data => data.expiresAt > data.issuedAt,
  {
    message: "تاريخ انتهاء الترخيص يجب أن يكون بعد تاريخ الإصدار",
    path: ["expiresAt"],
  }
);

export const regulatoryReportSchema = z.object({
  academyId: positiveId,
  authorityId: positiveId,

  title: z.string().trim().min(3).max(220),

  reportType: z.enum([
    "performance",
    "compliance",
    "annual",
    "other",
  ]),

  content: z.record(z.string(), z.unknown()),
});

export const reportReviewSchema = z.object({
  status: z.enum([
    "under_review",
    "reviewed",
    "returned",
  ]),
});
