// Apply schema dm_conversation + dm_message (raw SQL — tanpa TTY konfirmasi drizzle-kit)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dm_conversation (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      social_account_id text NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
      platform_conversation_id text NOT NULL,
      partner_id text NOT NULL,
      partner_username text,
      partner_name text,
      partner_avatar_url text,
      last_message_at timestamp NOT NULL DEFAULT now(),
      last_message_preview text,
      last_message_direction text NOT NULL DEFAULT 'inbound',
      unread_count integer NOT NULL DEFAULT 0,
      assigned_member_id text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS dm_conversation_account_platform_uidx
      ON dm_conversation (social_account_id, platform_conversation_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dm_conversation_organization_lastMessage_idx
      ON dm_conversation (organization_id, last_message_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dm_conversation_unread_idx
      ON dm_conversation (organization_id, unread_count);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dm_conversation_assigned_idx
      ON dm_conversation (assigned_member_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dm_message (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      social_account_id text NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
      conversation_id text NOT NULL REFERENCES dm_conversation(id) ON DELETE CASCADE,
      platform_message_id text NOT NULL,
      direction text NOT NULL,
      sender_id text,
      sender_username text,
      text text,
      media_url text,
      media_type text,
      occurred_at timestamp NOT NULL DEFAULT now(),
      synced_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS dm_message_account_platform_uidx
      ON dm_message (social_account_id, platform_message_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dm_message_conversation_time_idx
      ON dm_message (conversation_id, occurred_at);
  `);
  // Kolom tracking sync DM di social_account (idempotent)
  await db.execute(sql`
    ALTER TABLE social_account ADD COLUMN IF NOT EXISTS last_dm_synced_at timestamp;
  `);
  console.log("OK — tabel dm_conversation & dm_message siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
