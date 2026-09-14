// Client Sumopod Pay — dokumentasi: docs/sumopod-pay.md
// Konfigurasi resolve: DB platformSettings (admin panel, encrypted) → fallback env.
// Cache in-memory 60 detik — di-invalidate saat admin menyimpan konfigurasi.
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@sahabatkreator/db";
import { platformSettings } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto";

export type CreatePaymentInput = {
  orderId: string;
  amount: number; // IDR, tanpa desimal
  expiresInHours?: number;
  successReturnUrl: string;
  cancelReturnUrl: string;
  paymentMethodTypeCode?: string; // mis. QRIS, VA, dsb
};

export type CreatePaymentResult = {
  paymentId: string;
  orderId: string;
  amount: number;
  fee: number;
  netAmount: number;
  paymentLinkUrl: string;
  paymentCode?: string;
  paymentCodeType?: string;
  paymentChannelUsed?: string;
  status: string;
  expiresAt: string;
};

export class SumopodError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "SumopodError";
  }
}

export type SumopodConfig = {
  apiBaseUrl: string;
  apiKey: string;
  /** Sumber konfigurasi aktif — untuk indikator di admin panel */
  source: "admin" | "env";
};

const CONFIG_CACHE_MS = 60_000;
let cachedConfig: { config: SumopodConfig | null; at: number } | null = null;

/** Invalidate cache konfigurasi — dipanggil setelah admin save/delete. */
export function invalidateSumopodConfigCache(): void {
  cachedConfig = null;
}

/**
 * Ambil konfigurasi Sumopod aktif.
 * Prioritas: platformSettings DB (encrypted, diisi admin) → env.
 * Return null jika tidak ada API key dari kedua sumber (belum dikonfigurasi).
 */
export async function getSumopodConfig(): Promise<SumopodConfig | null> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_CACHE_MS) {
    return cachedConfig.config;
  }

  const [settings] = await db
    .select({
      sumopodApiBaseUrl: platformSettings.sumopodApiBaseUrl,
      sumopodApiKeyEnc: platformSettings.sumopodApiKeyEnc,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);

  const dbKey = settings?.sumopodApiKeyEnc ? decrypt(settings.sumopodApiKeyEnc) : null;
  const apiKey = dbKey || env.SUMOPOD_API_KEY || null;
  if (!apiKey) {
    cachedConfig = { config: null, at: Date.now() };
    return null;
  }

  const config: SumopodConfig = {
    apiBaseUrl: (dbKey ? settings?.sumopodApiBaseUrl : null) || env.SUMOPOD_API_BASE_URL,
    apiKey,
    source: dbKey ? "admin" : "env",
  };
  cachedConfig = { config, at: Date.now() };
  return config;
}

export async function isSumopodConfigured(): Promise<boolean> {
  return (await getSumopodConfig()) !== null;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const config = await getSumopodConfig();
  if (!config) {
    throw new SumopodError(
      "Pembayaran belum dikonfigurasi — isi API key Sumopod di panel admin atau env",
    );
  }
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": config.apiKey,
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!res.ok) {
    throw new SumopodError(body?.error?.message || `Sumopod error ${res.status}`, res.status);
  }
  return body as T;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const data = await request<Record<string, unknown>>("/api/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      amount: input.amount,
      currency: "IDR",
      expires_in_hours: input.expiresInHours ?? 24,
      success_return_url: input.successReturnUrl,
      cancel_return_url: input.cancelReturnUrl,
      ...(input.paymentMethodTypeCode
        ? { payment_method_type_code: input.paymentMethodTypeCode }
        : {}),
    }),
  });
  return {
    paymentId: String(data.payment_id),
    orderId: String(data.order_id),
    amount: Number(data.amount),
    fee: Number(data.fee ?? 0),
    netAmount: Number(data.net_amount ?? 0),
    paymentLinkUrl: String(data.payment_link_url),
    paymentCode: data.payment_code ? String(data.payment_code) : undefined,
    paymentCodeType: data.payment_code_type ? String(data.payment_code_type) : undefined,
    paymentChannelUsed: data.payment_channel_used ? String(data.payment_channel_used) : undefined,
    status: String(data.status),
    expiresAt: String(data.expires_at),
  };
}

export async function getPayment(paymentId: string): Promise<{
  status: string;
  orderId: string;
  amount: number;
}> {
  const data = await request<Record<string, unknown>>(`/api/v1/payments/${paymentId}`, {
    method: "GET",
  });
  return {
    status: String(data.status),
    orderId: String(data.order_id),
    amount: Number(data.amount),
  };
}

/**
 * Ambil webhook token aktif (DB encrypted → fallback env).
 * Return null jika tidak ada — caller menolak webhook.
 */
async function getWebhookToken(): Promise<string | null> {
  const [settings] = await db
    .select({ sumopodWebhookTokenEnc: platformSettings.sumopodWebhookTokenEnc })
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);
  const dbToken = settings?.sumopodWebhookTokenEnc
    ? decrypt(settings.sumopodWebhookTokenEnc)
    : null;
  return dbToken || env.SUMOPOD_WEBHOOK_TOKEN || null;
}

/**
 * Perbandingan token timing-safe: kedua nilai di-hash SHA-256 dulu agar
 * panjang buffer selalu sama (timingSafeEqual menolak panjang beda), lalu
 * dibandingkan konstanta-waktu — mencegah timing attack memetakan token
 * webhook Sumopod byte demi byte.
 */
function tokensMatch(received: string, expected: string): boolean {
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verifikasi webhook Sumopod.
 * Alternatif sederhana sesuai dokumentasi: bandingkan X-Webhook-Token
 * (dengan perbandingan timing-safe, bukan ===).
 */
export async function verifyWebhookToken(receivedToken: string | undefined): Promise<boolean> {
  const expected = await getWebhookToken();
  if (!expected || !receivedToken) return false;
  return tokensMatch(receivedToken, expected);
}
