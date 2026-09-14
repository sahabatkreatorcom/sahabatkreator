// API Billing — plan, checkout (Sumopod Pay), status langganan

import { db } from "@sahabatkreator/db";
import { payment, plan, subscription } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { getOrgLimits, getOrgTier } from "../lib/billing";
import { generateOrderId } from "../lib/id";
import { createPayment, isSumopodConfigured } from "../lib/sumopod";

export const billingRoute = new Hono();

/** GET /billing/plans — daftar plan publik (untuk pricing page) */
billingRoute.get("/plans", async (c) => {
  const plans = await db
    .select({
      id: plan.id,
      tier: plan.tier,
      name: plan.name,
      description: plan.description,
      priceIdr: plan.priceIdr,
      billingIntervalMonths: plan.billingIntervalMonths,
      maxSocialAccounts: plan.maxSocialAccounts,
      maxScheduledPostsPerMonth: plan.maxScheduledPostsPerMonth,
      maxTeamMembers: plan.maxTeamMembers,
      maxMediaStorageMb: plan.maxMediaStorageMb,
      aiCreditsPerMonth: plan.aiCreditsPerMonth,
      features: plan.features,
      sortOrder: plan.sortOrder,
    })
    .from(plan)
    .where(and(eq(plan.isActive, true), eq(plan.billingIntervalMonths, 1)))
    .orderBy(plan.sortOrder);
  return c.json({ plans });
});

/** GET /billing/status — status langganan + limits org aktif */
billingRoute.get("/status", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [sub] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.organizationId, ctx.organization.id))
      .limit(1);
    const limits = await getOrgLimits(ctx.organization.id);
    const tier = await getOrgTier(ctx.organization.id);
    return c.json({
      tier,
      limits,
      subscription: sub ?? null,
      configured: isSumopodConfigured(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const checkoutSchema = z.object({
  planId: z.string().min(1),
});

/** POST /billing/checkout — buat payment Sumopod untuk upgrade plan */
billingRoute.post("/checkout", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const body = await c.req.json();
    const input = checkoutSchema.parse(body);

    const [targetPlan] = await db
      .select()
      .from(plan)
      .where(and(eq(plan.id, input.planId), eq(plan.isActive, true)))
      .limit(1);
    if (!targetPlan) {
      return c.json({ message: "Plan tidak ditemukan" }, 404);
    }

    if (targetPlan.priceIdr <= 0) {
      return c.json({ message: "Plan gratis tidak memerlukan pembayaran" }, 400);
    }

    if (!(await isSumopodConfigured())) {
      return c.json({ message: "Pembayaran belum dikonfigurasi. Hubungi administrator." }, 503);
    }

    const orderId = generateOrderId();
    // Sandbox Sumopod menolak return URL non-HTTPS → bisa di-override via env
    const returnBase = env.SUMOPOD_RETURN_BASE_URL ?? env.WEB_URL;
    const result = await createPayment({
      orderId,
      amount: targetPlan.priceIdr,
      expiresInHours: 24,
      successReturnUrl: `${returnBase}/settings/billing?status=success`,
      cancelReturnUrl: `${returnBase}/settings/billing?status=cancel`,
    });

    // Catat payment pending
    await db.insert(payment).values({
      id: orderId,
      organizationId: ctx.organization.id,
      planId: targetPlan.id,
      orderId,
      providerPaymentId: result.paymentId,
      amount: result.amount,
      fee: result.fee,
      netAmount: result.netAmount,
      status: "pending",
      paymentLinkUrl: result.paymentLinkUrl,
      paymentCode: result.paymentCode,
      expiresAt: new Date(result.expiresAt),
    });

    // Pastikan baris subscription ada (tier tetap, menunggu pembayaran)
    await db
      .insert(subscription)
      .values({
        id: orderId,
        organizationId: ctx.organization.id,
        planId: targetPlan.id,
        tier: "free",
        status: "pending",
      })
      .onConflictDoNothing();

    return c.json({
      orderId,
      paymentId: result.paymentId,
      paymentLinkUrl: result.paymentLinkUrl,
      paymentCode: result.paymentCode,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /billing/payments — riwayat pembayaran org */
billingRoute.get("/payments", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const payments = await db
      .select()
      .from(payment)
      .where(eq(payment.organizationId, ctx.organization.id))
      .orderBy(payment.createdAt);
    return c.json({ payments });
  } catch (error) {
    return errorResponse(error);
  }
});
