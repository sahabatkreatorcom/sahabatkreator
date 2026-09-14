// Migrasi tabel commerce (tanpa TTY — raw SQL via node-postgres)
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
    CREATE TABLE IF NOT EXISTS product (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'IDR',
      image_url TEXT,
      product_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      instagram_product_id TEXT,
      facebook_product_id TEXT,
      tiktok_product_id TEXT,
      pinterest_product_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS product_organization_idx
      ON product (organization_id, is_active);

    CREATE TABLE IF NOT EXISTS product_tag (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      product_price NUMERIC(12,2),
      product_currency TEXT,
      product_image_url TEXT,
      position_x NUMERIC(5,4),
      position_y NUMERIC(5,4),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS product_tag_post_idx ON product_tag (post_id);
    CREATE INDEX IF NOT EXISTS product_tag_product_idx ON product_tag (product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS product_tag_post_product_uidx
      ON product_tag (post_id, product_id);
  `);

  console.log("OK: tabel product + product_tag dibuat/diverifikasi");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
