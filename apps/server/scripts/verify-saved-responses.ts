// E2E verifikasi saved responses — CRUD data layer (endpoint route sudah ada
// di engagement.ts; divalidasi via HTTP setelah restart).
// Jalankan: bun scripts/verify-saved-responses.ts (dari apps/server)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { organization, savedResponse } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization.");
    process.exit(1);
  }

  // Bersihkan sisa test
  await db
    .delete(savedResponse)
    .where(
      and(eq(savedResponse.organizationId, org.id), eq(savedResponse.name, "Test Terima Kasih")),
    );

  // Skenario 1: insert
  const [created] = await db
    .insert(savedResponse)
    .values({
      id: "sk_sr_test01",
      organizationId: org.id,
      name: "Test Terima Kasih",
      content: "Terima kasih banyak sudah mampir, Kak!",
    })
    .returning();
  pass("insert", Boolean(created?.id), `id=${created?.id}`);

  // Skenario 2: list by org
  const list = await db
    .select()
    .from(savedResponse)
    .where(eq(savedResponse.organizationId, org.id));
  const found = list.find((r) => r.name === "Test Terima Kasih");
  pass("list by org", Boolean(found), `${list.length} response di org`);

  // Skenario 3: guard — delete dengan org yang salah tidak menghapus
  const wrong = await db
    .delete(savedResponse)
    .where(and(eq(savedResponse.id, created!.id), eq(savedResponse.organizationId, "org-salah")))
    .returning({ id: savedResponse.id });
  pass("guard org (id org lain ditolak)", wrong.length === 0, `deleted=${wrong.length} (harus 0)`);

  // Skenario 4: delete benar
  const ok = await db
    .delete(savedResponse)
    .where(and(eq(savedResponse.id, created!.id), eq(savedResponse.organizationId, org.id)))
    .returning({ id: savedResponse.id });
  pass("delete oleh pemilik", ok.length === 1, `deleted=${ok.length}`);

  // Skenario 5: cascade — org terhapus otomatis membersihkan response
  // (dibuktikan lewat FK onDelete: cascade pada schema; tidak diuji destruktif di sini)
  console.log("INFO — cascade org delete terjamin FK onDelete: cascade (schema engagement.ts)");

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
