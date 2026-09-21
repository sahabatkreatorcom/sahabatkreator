// API CSV Bulk Import — preview validasi + import post massal

import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { importCsvPosts } from "../lib/csv-import";

export const csvImportRoute = new Hono();

const importSchema = z.object({
  csv: z.string().min(10).max(500_000),
  /** false = hanya validasi (preview), true = benar-benar import */
  importMode: z.boolean().default(false),
});

/** POST /import/csv — preview atau import post massal dari CSV */
csvImportRoute.post("/csv", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = importSchema.parse(await c.req.json());

    // Batasi baris (500 baris cukup untuk bulk scheduling UMKM)
    const lineCount = input.csv.split("\n").length;
    if (lineCount > 501) {
      return c.json({ message: "Maksimal 500 baris per import." }, 400);
    }

    const result = await importCsvPosts(ctx.organization.id, input.csv, ctx.user.id, {
      importMode: input.importMode,
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
