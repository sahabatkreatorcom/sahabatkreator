// Webhook Sumopod Pay — single source of truth perubahan tier langganan
// Dokumentasi: docs/sumopod-pay.md

import { db } from "@sahabatkreator/db";
import {
  payment,
  plan,
  processedWebhookEvent,
  subscription,
  webhookLog,
} from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { verifyWebhookToken } from "../lib/sumopod";

export const webhookRoute = new Hono();

// Bentuk luar minimal — event test dari halaman Settings Sumopod tidak
// menjamin field data.event nyata (payment_id/order_id/dst), jadi test event
// TIDAK boleh lewat skema ketat di bawah.
const webhookEnvelopeSchema = z.object({
  event_type: z.string(),
  data: z.unknown(),
});

const webhookPayloadSchema = z.object({
  event_type: z.enum(["payment.completed", "payment.failed", "payment.expired", "payment.test"]),
  data: z.object({
    payment_id: z.string(),
    order_id: z.string(),
    amount: z.number(),
    fee: z.number().optional(),
    net_amount: z.number().optional(),
    status: z.string(),
    payment_method: z.string().optional(),
    completed_at: z.string().optional(),
  }),
});

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function logWebhook(eventType: string, payload: unknown, result: string) {
  await db.insert(webhookLog).values({
    id: crypto.randomUUID(),
    eventType,
    payload: payload as Record<string, unknown>,
    result,
  });
}

webhookRoute.post("/webhooks/sumopod", async (c) => {
  // Verifikasi token (cara sederhana sesuai dokumentasi Sumopod)
  const token = c.req.header("x-webhook-token");
  if (!(await verifyWebhookToken(token))) {
    await logWebhook("unknown", null, "invalid_token").catch(() => {});
    return c.json({ message: "Invalid webhook token" }, 401);
  }

  const rawBody = await c.req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }

  // Validasi bentuk luar dulu — cukup event_type & data untuk log + routing.
  const envelope = webhookEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    await logWebhook("unknown", payload, "invalid_payload").catch(() => {});
    return c.json({ message: "Invalid payload" }, 400);
  }

  // Event test dari halaman Settings Sumopod — payload-nya bebas/beda dari
  // event nyata. Token sudah terverifikasi → cukup balas 200.
  if (envelope.data.event_type === "payment.test") {
    await logWebhook(envelope.data.event_type, payload, "verified").catch(() => {});
    return c.json({ received: true });
  }

  // Event nyata → validasi ketat field data sebelum diproses.
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    await logWebhook(envelope.data.event_type, payload, "invalid_payload").catch(() => {});
    return c.json({ message: "Invalid payload" }, 400);
  }
  const event = parsed.data;

  // Idempotency: skip jika event sudah pernah diproses
  const [existing] = await db
    .select()
    .from(processedWebhookEvent)
    .where(eq(processedWebhookEvent.providerPaymentId, event.data.payment_id))
    .limit(1);

  if (existing && existing.eventType === event.event_type) {
    await logWebhook(event.event_type, payload, "duplicate").catch(() => {});
    return c.json({ received: true, duplicate: true });
  }

  // Cari payment berdasarkan order_id
  const [paymentRow] = await db
    .select()
    .from(payment)
    .where(eq(payment.orderId, event.data.order_id))
    .limit(1);

  if (!paymentRow) {
    await logWebhook(event.event_type, payload, "payment_not_found").catch(() => {});
    // Balas 200 agar tidak terus diretry — order tidak dikenal
    return c.json({ received: true, ignored: true });
  }

  const now = new Date();

  if (event.event_type === "payment.completed") {
    // Update payment
    await db
      .update(payment)
      .set({
        status: "completed",
        completedAt: event.data.completed_at ? new Date(event.data.completed_at) : now,
        paymentMethod: event.data.payment_method ?? null,
        fee: event.data.fee ?? paymentRow.fee,
        netAmount: event.data.net_amount ?? paymentRow.netAmount,
      })
      .where(eq(payment.id, paymentRow.id));

    // Aktivasi langganan sesuai plan
    if (paymentRow.planId) {
      const [targetPlan] = await db
        .select()
        .from(plan)
        .where(eq(plan.id, paymentRow.planId))
        .limit(1);

      if (targetPlan) {
        const currentPeriodStart = now;
        const currentPeriodEnd = addMonths(now, targetPlan.billingIntervalMonths);

        await db
          .insert(subscription)
          .values({
            id: paymentRow.id,
            organizationId: paymentRow.organizationId,
            planId: targetPlan.id,
            tier: targetPlan.tier,
            status: "active",
            currentPeriodStart,
            currentPeriodEnd,
          })
          .onConflictDoUpdate({
            target: subscription.organizationId,
            set: {
              planId: targetPlan.id,
              tier: targetPlan.tier,
              status: "active",
              currentPeriodStart,
              currentPeriodEnd,
              canceledAt: null,
              updatedAt: now,
            },
          });

        // Catat aktivitas org: tier berubah setelah pembayaran sukses (pelaku = sistem)
        fireActivity({
          orgId: paymentRow.organizationId,
          userId: null,
          action: "plan.changed",
          targetType: "subscription",
          targetId: paymentRow.organizationId,
          metadata: {
            tier: targetPlan.tier,
            planName: targetPlan.name,
            trigger: "payment.completed",
            orderId: paymentRow.orderId,
          },
        });
      }
    }
  } else if (event.event_type === "payment.failed") {
    await db.update(payment).set({ status: "failed" }).where(eq(payment.id, paymentRow.id));
    // Jika org belum punya langganan aktif, tandai failed
    await db
      .update(subscription)
      .set({ status: "failed" })
      .where(eq(subscription.organizationId, paymentRow.organizationId));

    // Catat aktivitas org: pembayaran gagal (pelaku = sistem)
    fireActivity({
      orgId: paymentRow.organizationId,
      userId: null,
      action: "payment.failed",
      targetType: "payment",
      targetId: paymentRow.orderId,
      metadata: { orderId: paymentRow.orderId },
    });
  } else if (event.event_type === "payment.expired") {
    await db.update(payment).set({ status: "expired" }).where(eq(payment.id, paymentRow.id));
  }

  // Tandai event terproses (idempotency)
  await db.insert(processedWebhookEvent).values({
    id: crypto.randomUUID(),
    eventType: event.event_type,
    providerPaymentId: event.data.payment_id,
    payload: payload as Record<string, unknown>,
  });

  await logWebhook(event.event_type, payload, "verified").catch(() => {});
  return c.json({ received: true });
});
