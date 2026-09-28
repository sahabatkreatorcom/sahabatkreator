// Endpoint tulis: posts, media, automation.

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { MediaItemSchema } from "./reads";

extendZodWithOpenApi(z);

// ---------------- posts ----------------

export const CreatePostItemSchema = z
  .object({
    socialAccountId: z.string().min(1),
    content: z.string().optional(),
    hashtags: z.array(z.string()).default([]),
    firstComment: z.string().nullable().optional(),
    platformSettings: z.record(z.string(), z.unknown()).optional(),
    mediaIds: z.array(z.string()).default([]),
  })
  .openapi("CreatePostItem");

export const CreatePostSchema = z
  .object({
    content: z.string().default(""),
    scheduledAt: z.string().datetime().nullable().optional(),
    timezone: z.string().optional().openapi({ default: "Asia/Jakarta" }),
    audioTrackId: z.string().nullable().optional(),
    productIds: z.array(z.string()).default([]),
    items: z.array(CreatePostItemSchema).min(1),
  })
  .openapi("CreatePostRequest");

export const CreatePostResponseSchema = z
  .object({ postGroupId: z.string() })
  .openapi("CreatePostResponse");

export const PublishQueuedResponseSchema = z
  .object({ ok: z.literal(true), queued: z.number() })
  .openapi("PublishQueuedResponse");

export const PublishInlineResponseSchema = z
  .object({
    ok: z.literal(true),
    published: z.number(),
    processing: z.number(),
    failed: z.number(),
  })
  .openapi("PublishInlineResponse");

export const RetryResponseSchema = z.object({ ok: z.literal(true) }).openapi("RetryResponse");

export const DeleteResponseSchema = z.object({ ok: z.literal(true) }).openapi("DeleteResponse");

// ---------------- media ----------------

export const ImportMediaSchema = z
  .object({
    url: z.string().url().max(2048),
    name: z.string().max(200).optional(),
    folderId: z.string().nullable().optional(),
  })
  .openapi("ImportMediaRequest");

export const ImportMediaResponseSchema = z
  .object({ media: MediaItemSchema })
  .openapi("ImportMediaResponse");

// ---------------- automation ----------------

export const AutomationReplyActionSchema = z
  .object({
    type: z.literal("reply"),
    message: z.string().min(1).max(1000),
  })
  .openapi("AutomationReplyAction");

export const AutomationAiReplyActionSchema = z
  .object({
    type: z.literal("ai_reply"),
    tone: z.enum(["ramah", "profesional", "lucu"]).default("ramah").optional(),
    delayMinutes: z.number().min(0).max(30).default(2).optional(),
    dryRun: z.boolean().default(false).optional(),
  })
  .openapi("AutomationAiReplyAction");

export const AutomationActionSchema = z
  .discriminatedUnion("type", [AutomationReplyActionSchema, AutomationAiReplyActionSchema])
  .openapi("AutomationAction");

export const AutomationRuleSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    source: z.enum(["dm", "comment"]),
    socialAccountId: z.string().nullable().optional(),
    triggers: z.array(z.string().min(1).max(50)).min(1).max(20),
    action: AutomationActionSchema,
    isActive: z.boolean().optional(),
  })
  .openapi("AutomationRuleRequest");

export const AutomationRuleRecordSchema = AutomationRuleSchema.extend({
  id: z.string(),
  organizationId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi("AutomationRuleRecord");

export const AutomationRuleResponseSchema = z
  .object({ rule: AutomationRuleRecordSchema })
  .openapi("AutomationRuleResponse");

export const AutomationListResponseSchema = z
  .object({
    rules: z.array(AutomationRuleRecordSchema),
    accounts: z.array(z.object({ id: z.string(), platform: z.string(), username: z.string() })),
  })
  .openapi("AutomationListResponse");
