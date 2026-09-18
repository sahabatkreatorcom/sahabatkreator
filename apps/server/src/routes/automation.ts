// API Automation Rules — CRUD aturan + log eksekusi

import { db } from "@sahabatkreator/db";
import { automationLog, automationRule, socialAccount } from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const automationRoute = new Hono();

// Aksi rule: template statis (reply) atau AI-generated dengan delay (ai_reply).
// ai_reply delay direkomendasikan: DM 0.5-2 menit (responsif), komentar 2-5 menit
// (hindari kesan bot + beri window untuk cancel / cek sudah-dibalas-manual).
const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reply"),
    message: z.string().min(1).max(1000),
  }),
  z.object({
    type: z.literal("ai_reply"),
    tone: z.enum(["ramah", "profesional", "lucu"]).default("ramah"),
    // 0.1-30 menit; dibulatkan ke atas oleh engine (min 0)
    delayMinutes: z.number().min(0).max(30).default(2),
    // true = generate draft tanpa kirim — review manual dulu (rekomendasi 1-2 minggu pertama)
    dryRun: z.boolean().default(false),
  }),
]);

const ruleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  source: z.enum(["dm", "comment"]),
  socialAccountId: z.string().nullable().optional(),
  triggers: z.array(z.string().min(1).max(50)).min(1).max(20),
  action: actionSchema,
  isActive: z.boolean().optional(),
});

/** GET /automation — list rule + akun org (untuk dropdown pilih akun) */
automationRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [rules, accounts] = await Promise.all([
      db
        .select()
        .from(automationRule)
        .where(eq(automationRule.organizationId, ctx.organization.id))
        .orderBy(desc(automationRule.updatedAt)),
      db
        .select({
          id: socialAccount.id,
          platform: socialAccount.platform,
          username: socialAccount.username,
        })
        .from(socialAccount)
        .where(
          and(
            eq(socialAccount.organizationId, ctx.organization.id),
            eq(socialAccount.isConnected, true),
          ),
        ),
    ]);
    return c.json({ rules, accounts });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /automation — buat rule baru */
automationRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const body = ruleSchema.parse(await c.req.json());

    // Validasi akun milik org bila ditentukan
    if (body.socialAccountId) {
      const [account] = await db
        .select({ id: socialAccount.id })
        .from(socialAccount)
        .where(
          and(
            eq(socialAccount.id, body.socialAccountId),
            eq(socialAccount.organizationId, ctx.organization.id),
          ),
        );
      if (!account) return c.json({ error: "Akun sosial tidak ditemukan" }, 400);
    }

    // Normalisasi trigger: trim + lowercase + dedup
    const triggers = [...new Set(body.triggers.map((t) => t.trim().toLowerCase()).filter(Boolean))];

    const [rule] = await db
      .insert(automationRule)
      .values({
        id: generateId("autol"),
        organizationId: ctx.organization.id,
        name: body.name,
        description: body.description ?? null,
        source: body.source,
        socialAccountId: body.socialAccountId ?? null,
        triggers,
        action: body.action,
        isActive: body.isActive ?? true,
      })
      .returning();
    return c.json({ rule }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /automation/:id — update rule (sebagian atau seluruh) */
automationRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const patch = ruleSchema.partial().parse(await c.req.json());

    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description ?? null;
    if (patch.source !== undefined) values.source = patch.source;
    if (patch.socialAccountId !== undefined) values.socialAccountId = patch.socialAccountId ?? null;
    if (patch.triggers !== undefined) {
      values.triggers = [
        ...new Set(patch.triggers.map((t) => t.trim().toLowerCase()).filter(Boolean)),
      ];
    }
    if (patch.action !== undefined) values.action = patch.action;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;

    if (Object.keys(values).length === 0) {
      return c.json({ error: "Tidak ada field untuk diupdate" }, 400);
    }

    const [rule] = await db
      .update(automationRule)
      .set(values)
      .where(
        and(
          eq(automationRule.id, c.req.param("id")),
          eq(automationRule.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!rule) return c.json({ error: "Rule tidak ditemukan" }, 404);
    return c.json({ rule });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /automation/:id — hapus rule (log ikut cascade) */
automationRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const deleted = await db
      .delete(automationRule)
      .where(
        and(
          eq(automationRule.id, c.req.param("id")),
          eq(automationRule.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: automationRule.id });
    if (deleted.length === 0) return c.json({ error: "Rule tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /automation/:id/logs — log eksekusi rule terbaru */
automationRoute.get("/:id/logs", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [rule] = await db
      .select({ id: automationRule.id })
      .from(automationRule)
      .where(
        and(
          eq(automationRule.id, c.req.param("id")),
          eq(automationRule.organizationId, ctx.organization.id),
        ),
      );
    if (!rule) return c.json({ error: "Rule tidak ditemukan" }, 404);

    const logs = await db
      .select()
      .from(automationLog)
      .where(eq(automationLog.ruleId, rule.id))
      .orderBy(desc(automationLog.occurredAt))
      .limit(50);
    return c.json({ logs });
  } catch (error) {
    return errorResponse(error);
  }
});
