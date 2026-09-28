// Komponen OpenAPI yang dipakai bersama oleh seluruh endpoint /v1.
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

/** Registry eksplisit — satu-satunya tempat schema /v1 didaftarkan. */
export const publicApiRegistry = new OpenAPIRegistry();

/** Body error /v1 — semua handler membalas {message} (+ field issues kadang). */
export const ErrorResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("ErrorResponse");

export const ErrorWithIssuesSchema = z
  .object({
    message: z.string(),
    issues: z
      .array(
        z.object({
          path: z.array(z.string()),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .openapi("ErrorWithIssues");

/** Skema input pasangan dari /v1/analytics (mode from/to). */
export const DateRangeQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .openapi({ example: "2026-01-01" }),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .openapi({ example: "2026-01-31" }),
  })
  .openapi("DateRangeQuery");

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).optional(),
    perPage: z.coerce.number().int().min(1).max(100).default(50).optional(),
  })
  .openapi("PaginationQuery");

export const PlatformEnum = z.enum([
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "linkedin_org",
  "pinterest",
  "threads",
  "x",
]);

export const ErrorResponseRef = { $ref: "#/components/schemas/ErrorResponse" } as const;
export const ErrorWithIssuesRef = {
  $ref: "#/components/schemas/ErrorWithIssues",
} as const;
