// Verifikasi integrasi riil: Sumopod Pay, Resend, Cloudflare R2.
// Jalankan: bun scripts/verify-integrations.ts (dari packages/db cwd tidak wajib, env di-load dari root)

import { resolve } from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

async function testSumopod() {
  const base = process.env.SUMOPOD_API_BASE_URL;
  const key = process.env.SUMOPOD_API_KEY;
  if (!key) {
    results.push({ name: "Sumopod Pay", ok: false, detail: "SUMOPOD_API_KEY kosong" });
    return;
  }
  try {
    // Catatan: sandbox Sumopod menolak return URL non-HTTPS (validasi redirecturl).
    // Di dev WEB_URL=localhost → pakai URL produksi untuk verifikasi kontrak API.
    const returnUrl = "https://sahabatkreator.com/settings/billing?status=success";
    const res = await fetch(`${base}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: JSON.stringify({
        order_id: `sk_test_${Date.now()}`,
        amount: 10000, // minimum sandbox Sumopod Rp 10.000
        currency: "IDR",
        expires_in_hours: 1,
        success_return_url: returnUrl,
        cancel_return_url: "https://sahabatkreator.com/settings/billing?status=cancel",
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.payment_id) {
      results.push({
        name: "Sumopod Pay",
        ok: true,
        detail: `payment dibuat: ${body.payment_id} — ${body.payment_link_url ?? "tanpa link"}`,
      });
    } else {
      results.push({
        name: "Sumopod Pay",
        ok: false,
        detail: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`,
      });
    }
  } catch (e) {
    results.push({ name: "Sumopod Pay", ok: false, detail: String(e) });
  }
}

async function testResend() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    results.push({
      name: "Resend",
      ok: false,
      detail: "RESEND_API_KEY / RESEND_FROM_EMAIL kosong",
    });
    return;
  }
  try {
    // Kirim email test ke alamat sandbox Resend (tidak mengganggu user riil)
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: ["delivered@resend.dev"],
        subject: "Verifikasi Integrasi Sahabat Kreator",
        text: "Email test otomatis. Abaikan.",
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.id) {
      results.push({ name: "Resend", ok: true, detail: `email terkirim (id: ${body.id})` });
    } else {
      results.push({
        name: "Resend",
        ok: false,
        detail: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`,
      });
    }
  } catch (e) {
    results.push({ name: "Resend", ok: false, detail: String(e) });
  }
}

async function testR2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    results.push({ name: "Cloudflare R2", ok: false, detail: "kredensial R2 belum lengkap" });
    return;
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  const key = `_verify/test-${Date.now()}.txt`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: "verifikasi integrasi sahabat kreator",
        ContentType: "text/plain",
      }),
    );
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    results.push({
      name: "Cloudflare R2",
      ok: true,
      detail: `upload+delete test object OK (bucket: ${R2_BUCKET})`,
    });
  } catch (e) {
    results.push({ name: "Cloudflare R2", ok: false, detail: String(e).slice(0, 300) });
  }
}

const main = async () => {
  console.log("=== Verifikasi Integrasi Sahabat Kreator ===\n");
  await Promise.all([testSumopod(), testResend(), testR2()]);
  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "[OK]" : "[GAGAL]";
    if (!r.ok) allOk = false;
    console.log(`${icon} ${r.name}: ${r.detail}`);
  }
  console.log(`\n${allOk ? "Semua integrasi OK" : "Ada integrasi yang gagal"}`);
  process.exit(allOk ? 0 : 1);
};

main();
