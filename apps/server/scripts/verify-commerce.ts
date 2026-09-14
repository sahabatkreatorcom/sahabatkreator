// E2E verifikasi Commerce — CRUD produk, tag produk ke post (snapshot denormalized),
// relasi & cascade.
// Jalankan: bun scripts/verify-commerce.ts (dari apps/server)
//
// Skenario:
// 1. Seed org + akun + produk → insert produk
// 2. Tag produk ke post (upsert snapshot) — relasi productId TERISI
//   (beda dari reference yang tidak pernah mengisi)
// 3. Update produk → tag snapshot TIDAK berubah (snapshot utuh)
// 4. Hapus produk → tag tetap ada dengan productId null (SET NULL, snapshot utuh)
// 5. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  organization as orgTable,
  post,
  postGroup,
  product,
  productTag,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Seed org + akun + postGroup + post
  const orgId = generateId("org");
  await db.insert(orgTable).values({
    id: orgId,
    name: "Verify Commerce Org",
    slug: `verify-commerce-${Date.now()}`,
    createdAt: new Date(),
  });
  const accountId = generateId("social");
  await db.insert(socialAccount).values({
    id: accountId,
    organizationId: orgId,
    platform: "instagram",
    platformAccountId: `ig-commerce-${Date.now()}`,
    username: "verify_commerce",
  });
  const groupId = generateId("postgrp");
  await db.insert(postGroup).values({
    id: groupId,
    organizationId: orgId,
    content: "Promo produk baru!",
    createdByUserId: null,
  });
  const postId = generateId("post");
  await db.insert(post).values({
    id: postId,
    organizationId: orgId,
    postGroupId: groupId,
    socialAccountId: accountId,
    platform: "instagram",
    status: "draft",
    content: "Promo produk baru!",
  });

  // 1. Insert produk
  const prodId = generateId("prod");
  await db.insert(product).values({
    id: prodId,
    organizationId: orgId,
    name: "Keripik Singkong Balado",
    description: "Renyah, pedas manis, 250gr",
    price: "25000.00",
    currency: "IDR",
    imageUrl: "https://example.com/keripik.jpg",
    productUrl: "https://tokoku.com/keripik",
  });
  const [prodRow] = await db.select().from(product).where(eq(product.id, prodId));
  if (!prodRow) {
    console.error("Setup produk gagal — row tidak ditemukan.");
    process.exit(1);
  }
  pass(
    "insert produk",
    prodRow.name === "Keripik Singkong Balado" && prodRow.price === "25000.00",
    `name=${prodRow.name}, price=${prodRow.price}`,
  );

  // 2. Tag produk ke post — snapshot + relasi terisi
  const tagId = generateId("ptag");
  await db.insert(productTag).values({
    id: tagId,
    organizationId: orgId,
    postId,
    productId: prodId,
    productName: prodRow.name,
    productPrice: prodRow.price,
    productCurrency: prodRow.currency,
    productImageUrl: prodRow.imageUrl,
  });
  const [tagRow] = await db.select().from(productTag).where(eq(productTag.id, tagId));
  pass(
    "tag dengan relasi + snapshot",
    tagRow?.productId === prodId &&
      tagRow?.productName === "Keripik Singkong Balado" &&
      tagRow?.productPrice === "25000.00",
    `productId terisi=${tagRow?.productId === prodId}, snapshot=${tagRow?.productName} @ ${tagRow?.productPrice}`,
  );

  // 3. Update produk → snapshot tag TIDAK berubah
  await db
    .update(product)
    .set({ name: "Keripik Singkong Balado V2", price: "30000.00" })
    .where(eq(product.id, prodId));
  const [tagAfterUpdate] = await db.select().from(productTag).where(eq(productTag.id, tagId));
  pass(
    "snapshot utuh setelah produk berubah",
    tagAfterUpdate?.productName === "Keripik Singkong Balado" &&
      tagAfterUpdate?.productPrice === "25000.00",
    `snapshot masih: ${tagAfterUpdate?.productName} @ ${tagAfterUpdate?.productPrice}`,
  );

  // 4. Hapus produk → tag tetap, productId null
  await db.delete(product).where(eq(product.id, prodId));
  const [tagAfterDelete] = await db.select().from(productTag).where(eq(productTag.id, tagId));
  pass(
    "hapus produk → tag snapshot bertahan",
    tagAfterDelete !== undefined &&
      tagAfterDelete.productId === null &&
      tagAfterDelete.productName === "Keripik Singkong Balado",
    `tag masih ada=${tagAfterDelete !== undefined}, productId=${tagAfterDelete?.productId}, nama=${tagAfterDelete?.productName}`,
  );

  // Cleanup
  await db.delete(orgTable).where(eq(orgTable.id, orgId));
  console.log("\nSelesai — cleanup OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
