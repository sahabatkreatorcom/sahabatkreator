// Migrasi tabel sound library (tanpa TTY — raw SQL via node-postgres)
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
    CREATE TABLE IF NOT EXISTS audio_track (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      storage_key TEXT,
      mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      size_bytes INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      waveform_data JSONB,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      category TEXT,
      uploaded_by_user_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audio_track_organization_idx
      ON audio_track (organization_id);
    CREATE INDEX IF NOT EXISTS audio_track_featured_idx
      ON audio_track (is_featured);

    ALTER TABLE post_group
      ADD COLUMN IF NOT EXISTS audio_track_id TEXT
      REFERENCES audio_track(id) ON DELETE SET NULL;
  `);

  console.log("OK: tabel audio_track + kolom post_group.audio_track_id dibuat/diverifikasi");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
