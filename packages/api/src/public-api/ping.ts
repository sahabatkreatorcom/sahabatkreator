// GET /v1/ping — verifikasi koneksi + token. Tanpa scope.

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const PingResponseSchema = z
  .object({
    ok: z.literal(true),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
    key: z.object({
      id: z.string(),
      name: z.string(),
      prefix: z.string().openapi({ example: "sk_live_ab12" }),
      scopes: z.array(z.string()),
    }),
    serverTime: z.string().datetime(),
  })
  .openapi("PingResponse");
