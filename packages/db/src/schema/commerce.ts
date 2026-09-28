// Schema domain COMMERCE — katalog produk + tag produk di post
//
// Riset reference app: Product → ProductCatalog (1 per org) + ProductTag
// (snapshot denormalized: platformProductId, name/price/image di row tag) +
// PostProduct (join table LEGACY yang tidak terpakai — DIHAPUS di normalisasi ini).
// Gap reference yang ditutup:
// - CRUD produk manual (reference hanya search — katalog hanya terisi dari sync
//   platform yang tidak jalan)
// - Relasi productId di tag DIISI (reference tidak pernah mengisi — relasi putus)
// - UTM template sudah ada di domain strategy (utm_template) — tidak diduplikasi
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { post } from "./content";
import { organization } from "./organization";

/**
 * Produk katalog — sumber manual (UMKM isi sendiri) atau sync platform
 * (platformProductId per platform untuk shopping tag).
 */
export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Harga dalam satuan terkecil? Tidak — numeric(12,2) cukup, currency terpisah
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    imageUrl: text("image_url"),
    productUrl: text("product_url"),
    isActive: boolean("is_active").notNull().default(true),
    // ID produk di katalog platform (untuk shopping tag saat publish)
    instagramProductId: text("instagram_product_id"),
    facebookProductId: text("facebook_product_id"),
    tiktokProductId: text("tiktok_product_id"),
    pinterestProductId: text("pinterest_product_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("product_organization_idx").on(table.organizationId, table.isActive)],
);

/**
 * Tag produk di post — snapshot denormalized (nama/harga/gambar tersimpan di row tag,
 * tampilan tag tetap utuh meski produk berubah/dihapus) + relasi productId internal.
 */
export const productTag = pgTable(
  "product_tag",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    // Snapshot denormalized
    productName: text("product_name").notNull(),
    productPrice: numeric("product_price", { precision: 12, scale: 2 }),
    productCurrency: text("product_currency"),
    productImageUrl: text("product_image_url"),
    // Posisi visual tag (0-1 persen) — null = non-visual tag (link produk)
    positionX: numeric("position_x", { precision: 5, scale: 4 }),
    positionY: numeric("position_y", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_tag_post_idx").on(table.postId),
    index("product_tag_product_idx").on(table.productId),
    uniqueIndex("product_tag_post_product_uidx").on(table.postId, table.productId),
  ],
);

export const productRelations = relations(product, ({ one, many }) => ({
  organization: one(organization, {
    fields: [product.organizationId],
    references: [organization.id],
  }),
  tags: many(productTag),
}));

export const productTagRelations = relations(productTag, ({ one }) => ({
  post: one(post, {
    fields: [productTag.postId],
    references: [post.id],
  }),
  product: one(product, {
    fields: [productTag.productId],
    references: [product.id],
  }),
}));
