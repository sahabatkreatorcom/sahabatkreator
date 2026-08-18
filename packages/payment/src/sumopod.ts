/**
 * SumoPod Pay Gateway Service
 *
 * SumoPod Pay adalah payment gateway yang mendukung QRIS, Virtual Account,
 * e-wallet, dan channel lokal Indonesia lainnya. Alur integrasi:
 * - Buat payment via `POST /api/v1/payments` → dapat `payment_link_url`
 * - Redirect user ke payment link untuk checkout
 * - Terima notifikasi via webhook (`payment.completed`, `payment.failed`, `payment.expired`)
 * - Verifikasi webhook via signature Svix atau X-Webhook-Token
 */

import { db, schema } from "@sahabat-kreator/db";
import { createHmac, timingSafeEqual as _timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PaymentRequest, PaymentResponse, SubscriptionRequest, SubscriptionResponse } from "./types";

const DEFAULT_BASE_URL = "https://api-pay-sandbox.sumopod.com";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SumoPodConfig {
  apiKey: string;
  webhookSecret?: string;
  webhookToken?: string;
  baseUrl: string;
}

interface CreatePaymentBody {
  order_id: string;
  amount: number;
  currency: string;
  expires_in_hours: number;
  success_return_url: string;
  cancel_return_url: string;
  payment_method_type_code?: string;
}

interface SumoPodPaymentResponse {
  payment_id: string;
  order_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  payment_link_url: string;
  payment_code?: string;
  payment_code_type?: string;
  payment_channel_used?: string;
  status: string;
  expires_at: string;
}

interface SumoPodWebhookEvent {
  event_type: "payment.completed" | "payment.failed" | "payment.expired" | "payment.test";
  data: {
    payment_id: string;
    order_id: string;
    amount: number;
    fee: number;
    net_amount: number;
    status: string;
    payment_method?: string;
    completed_at?: string;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class SumoPodService {
  /**
   * Get SumoPod configuration from global integration settings
   */
  private async getConfig(): Promise<SumoPodConfig | null> {
    try {
      const settings = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq }) => eq(t.id, "global_integration_settings"),
        columns: {
          sumopodApiKey: true,
          sumopodApiSecret: true,
          sumopodWebhookSecret: true,
          sumopodWebhookToken: true,
          sumopodBase: true,
          sumopodConfigured: true,
        },
      });

      if (!settings?.sumopodConfigured || !settings.sumopodApiKey) {
        return null;
      }

      return {
        apiKey: settings.sumopodApiKey,
        webhookSecret: settings.sumopodWebhookSecret || undefined,
        webhookToken: settings.sumopodWebhookToken || undefined,
        baseUrl: settings.sumopodBase || DEFAULT_BASE_URL,
      };
    } catch (error) {
      console.error("[SumoPod] Failed to get config:", error);
      return null;
    }
  }

  /**
   * Check if SumoPod is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null;
  }

  /**
   * Create a payment and return the checkout link
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, error: "Payment gateway not configured" };
    }

    // Validasi amount: integer positif, batas wajar (IDR).
    if (!Number.isInteger(request.amount) || request.amount <= 0 || request.amount > 1_000_000_000) {
      return { success: false, error: "Invalid payment amount" };
    }

    const paymentId = crypto.randomUUID();
    const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();

    try {
      await db.insert(schema.payment).values({
        id: paymentId,
        organizationId: request.organizationId,
        amount: request.amount,
        currency: request.currency || "IDR",
        description: request.description,
        customerName: request.customerName,
        customerEmail: request.customerEmail,
        customerPhone: request.customerPhone,
        invoiceNumber,
        metadata: request.metadata,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });

      // Validasi redirect URL (anti open-redirect via SumoPod).
      const successReturn = sanitizeReturnUrl(request.metadata?.successReturnUrl);
      const cancelReturn = sanitizeReturnUrl(request.metadata?.cancelReturnUrl);

      const body: CreatePaymentBody = {
        order_id: invoiceNumber,
        amount: request.amount,
        currency: request.currency || "IDR",
        expires_in_hours: 24,
        success_return_url: successReturn,
        cancel_return_url: cancelReturn,
        payment_method_type_code: (request.metadata?.paymentMethod as string) || "QRIS",
      };

      const res = await fetch(`${config.baseUrl}/api/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        await db
          .update(schema.payment)
          .set({ status: "FAILED", errorMessage: errText.slice(0, 2000), updatedAt: new Date() })
          .where(eq(schema.payment.id, paymentId));
        return { success: false, error: `SumoPod API error ${res.status}: ${errText}` };
      }

      const sumopod = (await res.json()) as SumoPodPaymentResponse;

      await db
        .update(schema.payment)
        .set({
          sumopodPaymentId: sumopod.payment_id,
          checkoutUrl: sumopod.payment_link_url,
          paymentLinkUrl: sumopod.payment_link_url,
          paymentCode: sumopod.payment_code,
          paymentCodeType: sumopod.payment_code_type,
          paymentChannelUsed: sumopod.payment_channel_used,
          fee: sumopod.fee,
          netAmount: sumopod.net_amount,
          expiresAt: new Date(sumopod.expires_at),
          updatedAt: new Date(),
        })
        .where(eq(schema.payment.id, paymentId));

      return {
        success: true,
        paymentId,
        checkoutUrl: sumopod.payment_link_url,
      };
    } catch (error) {
      console.error("[SumoPod] Failed to create payment:", error);
      await db
        .update(schema.payment)
        .set({ status: "FAILED", errorMessage: "Unexpected error creating payment", updatedAt: new Date() })
        .where(eq(schema.payment.id, paymentId))
        .catch(() => {});
      return { success: false, error: "Failed to create payment" };
    }
  }

  /**
   * Create a subscription record (local). Pembayaran berulang ditangani
   * dengan membuat payment baru per periode.
   */
  async createSubscription(request: SubscriptionRequest): Promise<SubscriptionResponse> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    try {
      const subscriptionId = `sub_${crypto.randomUUID()}`;
      await db.insert(schema.subscription).values({
        id: subscriptionId,
        organizationId: request.organizationId,
        planId: request.planId,
        planName: request.planId.toUpperCase(),
        amount: request.amount,
        currency: "IDR",
        interval: request.interval || "month",
        intervalCount: 1,
        status: request.trialDays && request.trialDays > 0 ? "trialing" : "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        createdAt: now,
        updatedAt: now,
      });

      if (request.trialDays && request.trialDays > 0) {
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + request.trialDays);
        await db
          .update(schema.subscription)
          .set({ trialStart: now, trialEnd })
          .where(eq(schema.subscription.id, subscriptionId));
      }

      return {
        success: true,
        subscriptionId,
        status: request.trialDays && request.trialDays > 0 ? "trialing" : "active",
      };
    } catch (error) {
      console.error("[SumoPod] Failed to create subscription:", error);
      return { success: false, error: "Failed to create subscription" };
    }
  }

  /**
   * Get payment status from DB
   */
  async getPaymentStatus(paymentId: string): Promise<{
    success: boolean;
    status?: string;
    checkoutUrl?: string;
    error?: string;
  }> {
    try {
      const paymentRecord = await db.query.payment.findFirst({
        where: (t, { eq }) => eq(t.id, paymentId),
        columns: { status: true, checkoutUrl: true, sumopodPaymentId: true },
      });

      if (!paymentRecord) {
        return { success: false, error: "Payment not found" };
      }

      return {
        success: true,
        status: paymentRecord.status,
        checkoutUrl: paymentRecord.checkoutUrl || undefined,
      };
    } catch (error) {
      console.error("[SumoPod] Failed to get payment status:", error);
      return { success: false, error: "Failed to get payment status" };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await db
        .update(schema.subscription)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.subscription.id, subscriptionId));

      return { success: true };
    } catch (error) {
      console.error("[SumoPod] Failed to cancel subscription:", error);
      return { success: false, error: "Failed to cancel subscription" };
    }
  }

  /**
   * Verify webhook signature (Svix HMAC-SHA256) atau X-Webhook-Token.
   * Gunakan raw body — satu karakter berubah pun akan memecah signature.
   * Menolak signature lama (replay) dan memakai perbandingan timing-safe.
   */
  async verifyWebhook(
    headers: { "svix-id"?: string; "svix-timestamp"?: string; "svix-signature"?: string; "x-webhook-token"?: string },
    rawBody: string,
  ): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;

    // Alternatif 1: X-Webhook-Token (lebih sederhana)
    const token = headers["x-webhook-token"];
    if (config.webhookToken && token) {
      return safeEqual(token, config.webhookToken);
    }

    // Alternatif 2: signature Svix
    if (config.webhookSecret && headers["svix-id"] && headers["svix-timestamp"] && headers["svix-signature"]) {
      return verifySvixSignature(
        config.webhookSecret,
        headers["svix-id"],
        headers["svix-timestamp"],
        headers["svix-signature"],
        rawBody,
      );
    }

    return false;
  }

  /**
   * Handle a verified webhook event, apply side effects to DB.
   * Idempoten: payment yang sudah COMPLETED tidak diproses ulang.
   */
  async handleWebhook(event: SumoPodWebhookEvent): Promise<void> {
    const { event_type: eventType, data } = event;

    if (eventType === "payment.completed") {
      const paymentRecord = await db.query.payment.findFirst({
        where: (t, { eq }) => eq(t.sumopodPaymentId, data.payment_id),
        columns: { id: true, organizationId: true, invoiceNumber: true, metadata: true, amount: true, status: true },
      });
      if (!paymentRecord) return;

      // Idempotency: jangan proses ulang payment yang sudah COMPLETED (retry delivery).
      if (paymentRecord.status === "COMPLETED") return;

      // Jangan pernah menaikkan plan dari pembayaran yang jumlahnya tidak sesuai.
      if (data.amount !== paymentRecord.amount) return;

      const planId = (paymentRecord.metadata as { planId?: string } | null)?.planId;
      const allowlist = ["PRO", "BUSINESS", "ENTERPRISE"];

      await db.transaction(async (tx) => {
        await tx
          .update(schema.payment)
          .set({
            status: "COMPLETED",
            completedAt: data.completed_at ? new Date(data.completed_at) : new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.payment.id, paymentRecord.id));

        // Aktivasi plan org bila metadata menyertakan planId (billing langganan).
        if (planId && allowlist.includes(planId)) {
          const org = await tx.query.organization.findFirst({
            where: (t, { eq }) => eq(t.id, paymentRecord.organizationId),
            columns: { tier: true, currentPeriodEnd: true, maxMembers: true },
          });
          if (org) {
            // Anti-downgrade: plan yang lebih rendah dari tier aktif tidak menurunkan tier.
            const rank = (t: string) => ["FREE", "PRO", "BUSINESS", "ENTERPRISE"].indexOf(t);
            if (rank(planId) < rank(org.tier)) return;

            // Perpanjang dari akhir periode aktif (bukan reset) bila masih berlaku.
            const base = org.currentPeriodEnd && org.currentPeriodEnd > new Date() ? org.currentPeriodEnd : new Date();
            await tx
              .update(schema.organization)
              .set({
                tier: planId as "PRO" | "BUSINESS" | "ENTERPRISE",
                subscriptionStatus: "active",
                currentPeriodEnd: addMonths(base, 1),
                maxMembers: getPlanMaxMembers(planId),
              })
              .where(eq(schema.organization.id, paymentRecord.organizationId));
          }
        }
      });
    } else if (eventType === "payment.failed") {
      const paymentRecord = await db.query.payment.findFirst({
        where: (t, { eq }) => eq(t.sumopodPaymentId, data.payment_id),
        columns: { id: true, status: true },
      });
      if (paymentRecord && paymentRecord.status !== "COMPLETED") {
        await db
          .update(schema.payment)
          .set({ status: "FAILED", updatedAt: new Date() })
          .where(eq(schema.payment.id, paymentRecord.id));
      }
    } else if (eventType === "payment.expired") {
      const paymentRecord = await db.query.payment.findFirst({
        where: (t, { eq }) => eq(t.sumopodPaymentId, data.payment_id),
        columns: { id: true, status: true },
      });
      if (paymentRecord && paymentRecord.status !== "COMPLETED") {
        await db
          .update(schema.payment)
          .set({ status: "CANCELED", updatedAt: new Date() })
          .where(eq(schema.payment.id, paymentRecord.id));
      }
    }
  }
}

// ─── Signature Verification ──────────────────────────────────────────────────

const SVIX_TOLERANCE_SECONDS = 5 * 60; // 5 menit

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return _timingSafeEqual(ba, bb);
}

/**
 * Validasi URL redirect (success/cancel) agar hanya http(s) menuju host aplikasi
 * sendiri — mencegah open-redirect via SumoPod bila metadata dipasok pemanggil lain.
 */
function sanitizeReturnUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      const appHost = new URL(appUrl).hostname;
      if (url.hostname !== appHost) return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): boolean {
  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;

  // Freshness — tolak webhook lama (replay protection).
  if (Math.abs(Date.now() / 1000 - timestamp) > SVIX_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const expectedSignature = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature bisa berisi banyak nilai "v1,<sig>" (saat rotate secret)
  const signatures = svixSignature.split(" ").map((s) => s.split(",")[1]);
  return signatures.some((sig) => sig && safeEqual(sig, expectedSignature));
}

function getPlanMaxMembers(planId: string): number {
  const limits: Record<string, number> = { PRO: 5, BUSINESS: 15, ENTERPRISE: 99 };
  return limits[planId] ?? 5;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const sumopodService = new SumoPodService();
