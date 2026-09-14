// Migrasi kolom needs_reconnect di social_account (token refresh worker)
// Jalankan: bun packages/db/scripts/apply-needs-reconnect.ts
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL tidak diset");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Kolom untuk tandai akun yang token-nya expired & refresh gagal
  await client.query(`
    ALTER TABLE "social_account"
    ADD COLUMN IF NOT EXISTS "needs_reconnect" BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("OK: kolom needs_reconnect diverifikasi");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
