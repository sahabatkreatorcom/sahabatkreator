// Migrasi tabel automation (tanpa TTY — raw SQL via node-postgres)
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL tidak diset");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS automation_rule (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT NOT NULL,
      social_account_id TEXT REFERENCES social_account(id) ON DELETE SET NULL,
      triggers JSONB NOT NULL DEFAULT '[]',
      action JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      triggered_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      last_triggered_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS automation_rule_org_active_idx
      ON automation_rule (organization_id, is_active);
    CREATE INDEX IF NOT EXISTS automation_rule_org_source_idx
      ON automation_rule (organization_id, source);

    CREATE TABLE IF NOT EXISTS automation_log (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL REFERENCES automation_rule(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      platform_item_id TEXT NOT NULL,
      partner_name TEXT,
      partner_username TEXT,
      message_sent TEXT,
      platform_reply_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS automation_log_rule_item_uidx
      ON automation_log (rule_id, platform_item_id);
    CREATE INDEX IF NOT EXISTS automation_log_org_time_idx
      ON automation_log (organization_id, occurred_at);
  `);

  console.log("OK: tabel automation_rule + automation_log dibuat/diverifikasi");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
