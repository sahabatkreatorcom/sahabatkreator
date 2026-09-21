// Apply schema push (vapid_key + push_subscription + notification_setting)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vapid_key (
      id text PRIMARY KEY DEFAULT 'singleton',
      public_key text NOT NULL,
      private_key_enc text NOT NULL,
      contact text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscription (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      endpoint text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL,
      device_label text,
      user_agent text,
      last_notified_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_user_endpoint_uidx
      ON push_subscription (user_id, endpoint);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS push_subscription_organization_idx
      ON push_subscription (organization_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notification_setting (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      post_published boolean NOT NULL DEFAULT true,
      post_failed boolean NOT NULL DEFAULT true,
      new_comment boolean NOT NULL DEFAULT true,
      new_dm boolean NOT NULL DEFAULT true,
      new_mention boolean NOT NULL DEFAULT true,
      new_review boolean NOT NULL DEFAULT true,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS notification_setting_user_org_uidx
      ON notification_setting (user_id, organization_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS notification_setting_organization_idx
      ON notification_setting (organization_id);
  `);

  console.log("OK — tabel vapid_key, push_subscription, notification_setting siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
