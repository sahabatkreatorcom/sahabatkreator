// E2E verifikasi bridge Repliz — config, routing helper, health check kredensial.
// Jalankan: bun scripts/verify-repliz.ts (dari apps/server)
// Catatan: butuh kredensial Repliz aktif di bridge_config (atur via /admin/credentials).

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { bridgeConfig } from "@sahabatkreator/db/schema";
import { REPLIZ_PLATFORMS, replizListAccounts } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // 1. Bridge config ada & aktif
  const [cfg] = await db
    .select()
    .from(bridgeConfig)
    .where(eq(bridgeConfig.provider, "repliz"))
    .limit(1);
  pass(
    "bridge-config",
    Boolean(cfg?.isActive),
    cfg ? "aktif" : "belum dikonfigurasi (atur di /admin/credentials)",
  );
  if (!cfg?.isActive) {
    console.log("\nSelesai (parsial) — sisanya butuh bridge aktif.");
    return;
  }

  // 2. Decrypt secret → panggil API Repliz (GET /public/account)
  const { decrypt } = await import("../src/lib/crypto");
  const cred = { accessKey: cfg.accessKey, secretKey: decrypt(cfg.secretEnc) };
  try {
    const result = await replizListAccounts(cred, { page: 1, limit: 10 });
    const accounts = result.docs;
    const connected = accounts.filter((a) => a.isConnected);
    pass(
      "repliz-auth",
      true,
      `API merespons — ${result.totalDocs} akun di workspace, ${connected.length}/${accounts.length} terhubung`,
    );
  } catch (e) {
    pass("repliz-auth", false, `Gagal panggil API Repliz: ${(e as Error).message}`);
    return;
  }

  // 3. Routing platform didukung
  const routing = cfg.routing ?? {};
  const replizPlatforms = Object.entries(routing)
    .filter(([, m]) => m === "repliz")
    .map(([p]) => p);
  const unsupported = replizPlatforms.filter((p) => !(p in REPLIZ_PLATFORMS));
  pass(
    "routing-valid",
    unsupported.length === 0,
    unsupported.length === 0
      ? replizPlatforms.length > 0
        ? `Platform via bridge: ${replizPlatforms.join(", ")}`
        : "Semua platform native (tidak ada via bridge)"
      : `Tidak didukung Repliz: ${unsupported.join(", ")}`,
  );

  // 4. Akun sosial lokal dengan metadata.replizAccountId
  const { socialAccount } = await import("@sahabatkreator/db/schema");
  const localBridge = await db.select().from(socialAccount);
  const bridgeAccounts = localBridge.filter((a) => a.metadata?.replizAccountId);
  pass(
    "bridge-accounts",
    true,
    `${bridgeAccounts.length} akun lokal terhubung via bridge${
      bridgeAccounts.length > 0
        ? ` (${bridgeAccounts.map((a) => `${a.platform}:${a.username}`).join(", ")})`
        : " — hubungkan via dashboard untuk uji publish"
    }`,
  );

  console.log("\nSelesai.");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("verify-repliz gagal:", e);
  process.exit(1);
});
