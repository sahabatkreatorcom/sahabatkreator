// API Commerce — CRUD produk katalog + tag produk di post
//
// Normalisasi dari reference app:
// - CRUD produk manual lengkap (reference hanya search — katalog hanya bisa
//   terisi dari sync platform yang butuh approval Meta Commerce)
// - Tag: snapshot denormalized + relasi productId diisi (reference tidak pernah
//   mengisi relasi — putus)
// - PostProduct legacy join table tidak direplikasi (tumpang tindih ProductTag)

import { db } from "@sahabatkreator/db";
import { post as postTable, product, productTag } from "@sahabatkreator/db/schema";
import { and, desc, eq, ilike } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const commerceRoute = new Hono();

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().nonnegative().max(999_999_999),
  currency: z.string().length(3).default("IDR"),
  imageUrl: z.string().url().nullable().optional(),
  productUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
});

/** GET /commerce/products — list/search produk aktif org. Query: q, all (true = termasuk nonaktif) */
commerceRoute.get("/products", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const q = c.req.query("q");
    const includeInactive = c.req.query("all") === "true";

    const conditions = [eq(product.organizationId, ctx.organization.id)];
    if (!includeInactive) conditions.push(eq(product.isActive, true));
    if (q) conditions.push(ilike(product.name, `%${q}%`));

    const items = await db
      .select()
      .from(product)
      .where(and(...conditions))
      .orderBy(desc(product.updatedAt))
      .limit(100);
    return c.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /commerce/products — tambah produk */
commerceRoute.post("/products", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const body = productSchema.parse(await c.req.json());

    const id = generateId("prod");
    const [row] = await db
      .insert(product)
      .values({
        id,
        organizationId: ctx.organization.id,
        name: body.name,
        description: body.description ?? null,
        price: body.price.toFixed(2),
        currency: body.currency,
        imageUrl: body.imageUrl ?? null,
        productUrl: body.productUrl ?? null,
        isActive: body.isActive ?? true,
      })
      .returning();
    return c.json({ product: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /commerce/products/:id — update produk */
commerceRoute.patch("/products/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const body = productSchema.partial().parse(await c.req.json());

    const values: Record<string, unknown> = {};
    if (body.name !== undefined) values.name = body.name;
    if (body.description !== undefined) values.description = body.description;
    if (body.price !== undefined) values.price = body.price.toFixed(2);
    if (body.currency !== undefined) values.currency = body.currency;
    if (body.imageUrl !== undefined) values.imageUrl = body.imageUrl;
    if (body.productUrl !== undefined) values.productUrl = body.productUrl;
    if (body.isActive !== undefined) values.isActive = body.isActive;
    if (Object.keys(values).length === 0) {
      return c.json({ message: "Tidak ada field untuk diupdate" }, 400);
    }

    const [row] = await db
      .update(product)
      .set(values)
      .where(
        and(eq(product.id, c.req.param("id")), eq(product.organizationId, ctx.organization.id)),
      )
      .returning();
    if (!row) return c.json({ message: "Produk tidak ditemukan" }, 404);
    return c.json({ product: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /commerce/products/:id — hapus produk (tag snapshot tetap utuh, productId → null) */
commerceRoute.delete("/products/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const deleted = await db
      .delete(product)
      .where(
        and(eq(product.id, c.req.param("id")), eq(product.organizationId, ctx.organization.id)),
      )
      .returning({ id: product.id });
    if (deleted.length === 0) return c.json({ message: "Produk tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Tag produk di post
// ---------------------------------------------------------------------------

const tagSchema = z.object({
  postId: z.string().min(1),
  productId: z.string().min(1),
  positionX: z.number().min(0).max(1).nullable().optional(),
  positionY: z.number().min(0).max(1).nullable().optional(),
});

/** POST /commerce/tags — tag produk ke post (snapshot denormalized dari data produk saat ini) */
commerceRoute.post("/tags", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const body = tagSchema.parse(await c.req.json());

    // Validasi post milik org
    const [postRow] = await db
      .select({ id: postTable.id })
      .from(postTable)
      .where(and(eq(postTable.id, body.postId), eq(postTable.organizationId, ctx.organization.id)));
    if (!postRow) return c.json({ message: "Post tidak ditemukan" }, 404);

    // Ambil produk — snapshot data saat ini
    const [prod] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, body.productId), eq(product.organizationId, ctx.organization.id)));
    if (!prod) return c.json({ message: "Produk tidak ditemukan" }, 404);

    const [tag] = await db
      .insert(productTag)
      .values({
        id: generateId("ptag"),
        organizationId: ctx.organization.id,
        postId: body.postId,
        productId: prod.id,
        productName: prod.name,
        productPrice: prod.price,
        productCurrency: prod.currency,
        productImageUrl: prod.imageUrl,
        positionX:
          body.positionX !== undefined && body.positionX !== null
            ? body.positionX.toFixed(4)
            : null,
        positionY:
          body.positionY !== undefined && body.positionY !== null
            ? body.positionY.toFixed(4)
            : null,
      })
      .onConflictDoUpdate({
        target: [productTag.postId, productTag.productId],
        set: {
          productName: prod.name,
          productPrice: prod.price,
          productCurrency: prod.currency,
          productImageUrl: prod.imageUrl,
          positionX:
            body.positionX !== undefined && body.positionX !== null
              ? body.positionX.toFixed(4)
              : null,
          positionY:
            body.positionY !== undefined && body.positionY !== null
              ? body.positionY.toFixed(4)
              : null,
        },
      })
      .returning();
    return c.json({ tag }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /commerce/tags?postId= — list tag post */
commerceRoute.get("/tags", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const postId = c.req.query("postId");
    if (!postId) return c.json({ message: "postId wajib diisi" }, 400);

    const tags = await db
      .select()
      .from(productTag)
      .where(
        and(eq(productTag.organizationId, ctx.organization.id), eq(productTag.postId, postId)),
      );
    return c.json({ tags });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /commerce/tags/:id — hapus tag dari post */
commerceRoute.delete("/tags/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const deleted = await db
      .delete(productTag)
      .where(
        and(
          eq(productTag.id, c.req.param("id")),
          eq(productTag.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: productTag.id });
    if (deleted.length === 0) return c.json({ message: "Tag tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
