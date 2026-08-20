/**
 * Seed script lengkap: membuat admin user jika belum ada, lalu seed blog post.
 * Jalankan: pnpm db:seed
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { loadRootEnv } from "@sahabat-kreator/env/load";
import { db, schema } from "../index";

loadRootEnv();

// --- Admin User ---
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@sahabatkreator.com";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";

async function ensureAdmin() {
  const existing = await db.query.user.findFirst({
    where: eq(schema.user.email, ADMIN_EMAIL),
    columns: { id: true, name: true, email: true, role: true },
  });

  if (existing) {
    // Update role jadi admin
    await db
      .update(schema.user)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(schema.user.id, existing.id));
    console.log(`Admin exists: ${ADMIN_EMAIL}`);
    return { id: existing.id, name: existing.name, email: existing.email };
  }

  // Buat admin baru (emailVerified=false karena belum verifikasi email)
  const id = randomUUID();
  await db.insert(schema.user).values({
    id,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    emailVerified: false,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`Created admin: ${ADMIN_EMAIL}`);
  return { id, name: ADMIN_NAME, email: ADMIN_EMAIL };
}

// --- Blog Seed ---
const SLUG = "jadwal-post-instagram-otomatis";

const TAGS = [
  { name: "Instagram", slug: "instagram", color: "#E4405F" },
  { name: "Social Media", slug: "social-media", color: "#D4A574" },
  { name: "Content Planner", slug: "content-planner", color: "#4285F4" },
  { name: "Digital Marketing", slug: "digital-marketing", color: "#0A66C2" },
];

const TITLE =
  "Cara Menjadwalkan Post Instagram Otomatis: Panduan Lengkap untuk Konten Kreator";

const EXCERPT =
  "Jadwalkan post Instagram otomatis dan kelola semua akun sosial media dari satu dashboard. Simak panduan lengkap tools content planner, best practice jam posting, dan strategi kalender konten agar engagement naik.";

const CONTENT = `Bagi konten kreator dan tim marketing, konsistensi posting adalah setengah dari kemenangan di media sosial. Namun mengisi kalender konten setiap hari sambil harus hadir di Instagram, TikTok, Facebook, Threads, LinkedIn, dan YouTube sekaligus bisa membuat siapa pun kewalahan. Solusinya satu: menjadwalkan post secara otomatis menggunakan content planner yang terpusat.

Artikel ini membahas langkah demi langkah cara menjadwalkan post Instagram otomatis, memilih tools yang tepat, menentukan jam posting terbaik, dan menyusun strategi kalender konten yang realistis. Semua tips di sini bisa langsung diterapkan, baik untuk personal brand, bisnis kecil, maupun agensi yang mengelola banyak akun klien.

Menjadwalkan post Instagram otomatis juga membantu Anda memisahkan waktu produksi dari waktu distribusi. Anda bisa menulis semua konten untuk seminggu dalam satu sesi kreatif, meninjau ulang tanpa tergesa, lalu membiarkan sistem mengunggah tepat waktu. Hasilnya, kualitas konten meningkat dan stres harian berkurang.`;

async function seedBlog(authorId: string) {
  const existing = await db.query.blogPost.findFirst({
    where: eq(schema.blogPost.slug, SLUG),
    columns: { id: true },
  });

  const now = new Date();
  let postId: string;

  if (existing) {
    await db
      .update(schema.blogPost)
      .set({
        title: TITLE,
        excerpt: EXCERPT,
        content: CONTENT,
        status: "PUBLISHED",
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.blogPost.id, existing.id));
    postId = existing.id;
    console.log(`Update post yang sudah ada: ${existing.id}`);
  } else {
    postId = randomUUID();
    await db.insert(schema.blogPost).values({
      id: postId,
      slug: SLUG,
      title: TITLE,
      excerpt: EXCERPT,
      content: CONTENT,
      status: "PUBLISHED",
      authorId,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Insert post baru: ${postId}`);
  }

  for (const tag of TAGS) {
    const existingTag = await db.query.blogTag.findFirst({
      where: eq(schema.blogTag.slug, tag.slug),
      columns: { id: true },
    });

    let tagId = existingTag?.id;
    if (!tagId) {
      tagId = randomUUID();
      await db.insert(schema.blogTag).values({ id: tagId, ...tag, createdAt: now });
      console.log(`Insert tag: ${tag.name}`);
    }

    await db.insert(schema.blogPostTag).values({ postId, tagId }).onConflictDoNothing();
  }

  console.log(`Selesai. Post ${postId} (${TAGS.length} tags). URL: /blog/${SLUG}`);
}

async function main() {
  console.log("=== Sahabat Kreator Seed ===");

  const admin = await ensureAdmin();
  if (!admin) {
    console.error("Seed berhenti: admin user belum ada.");
    process.exit(1);
  }

  await seedBlog(admin.id);
  console.log("=== Seed selesai ===");
}

main().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});

// --- Blog Seed ---
const SLUG = "jadwal-post-instagram-otomatis";

const TAGS = [
  { name: "Instagram", slug: "instagram", color: "#E4405F" },
  { name: "Social Media", slug: "social-media", color: "#D4A574" },
  { name: "Content Planner", slug: "content-planner", color: "#4285F4" },
  { name: "Digital Marketing", slug: "digital-marketing", color: "#0A66C2" },
];

const TITLE =
  "Cara Menjadwalkan Post Instagram Otomatis: Panduan Lengkap untuk Konten Kreator";

const EXCERPT =
  "Jadwalkan post Instagram otomatis dan kelola semua akun sosial media dari satu dashboard. Simak panduan lengkap tools content planner, best practice jam posting, dan strategi kalender konten agar engagement naik.";

const CONTENT = `Bagi konten kreator dan tim marketing, konsistensi posting adalah setengah dari kemenangan di media sosial. Namun mengisi kalender konten setiap hari sambil harus hadir di Instagram, TikTok, Facebook, Threads, LinkedIn, dan YouTube sekaligus bisa membuat siapa pun kewalahan. Solusinya satu: menjadwalkan post secara otomatis menggunakan content planner yang terpusat.

Artikel ini membahas langkah demi langkah cara menjadwalkan post Instagram otomatis, memilih tools yang tepat, menentukan jam posting terbaik, dan menyusun strategi kalender konten yang realistis. Semua tips di sini bisa langsung diterapkan, baik untuk personal brand, bisnis kecil, maupun agensi yang mengelola banyak akun klien.

Menjadwalkan post Instagram otomatis juga membantu Anda memisahkan waktu produksi dari waktu distribusi. Anda bisa menulis semua konten untuk seminggu dalam satu sesi kreatif, meninjau ulang tanpa tergesa, lalu membiarkan sistem mengunggah tepat waktu. Hasilnya, kualitas konten meningkat dan stres harian berkurang.`;

async function seedBlog(authorId: string) {
  const existing = await db.query.blogPost.findFirst({
    where: eq(schema.blogPost.slug, SLUG),
    columns: { id: true },
  });

  const now = new Date();
  let postId: string;

  if (existing) {
    await db
      .update(schema.blogPost)
      .set({
        title: TITLE,
        excerpt: EXCERPT,
        content: CONTENT,
        status: "PUBLISHED",
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.blogPost.id, existing.id));
    postId = existing.id;
    console.log(`Update post yang sudah ada: ${existing.id}`);
  } else {
    postId = randomUUID();
    await db.insert(schema.blogPost).values({
      id: postId,
      slug: SLUG,
      title: TITLE,
      excerpt: EXCERPT,
      content: CONTENT,
      status: "PUBLISHED",
      authorId,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Insert post baru: ${postId}`);
  }

  for (const tag of TAGS) {
    const existingTag = await db.query.blogTag.findFirst({
      where: eq(schema.blogTag.slug, tag.slug),
      columns: { id: true },
    });

    let tagId = existingTag?.id;
    if (!tagId) {
      tagId = randomUUID();
      await db.insert(schema.blogTag).values({ id: tagId, ...tag, createdAt: now });
      console.log(`Insert tag: ${tag.name}`);
    }

    await db.insert(schema.blogPostTag).values({ postId, tagId }).onConflictDoNothing();
  }

  console.log(`Selesai. Post ${postId} (${TAGS.length} tags). URL: /blog/${SLUG}`);
}

async function main() {
  console.log("=== Sahabat Kreator Seed ===");

  const admin = await ensureAdmin();
  if (!admin) {
    console.error("Seed berhenti: admin user belum ada.");
    process.exit(1);
  }

  await seedBlog(admin.id);
  console.log("=== Seed selesai ===");
}

main().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});
