/**
 * E2E: verifikasi field "Link pada post (opsional)" diteruskan ke Repliz.
 *
 * Dua path yang diuji (keduanya dijadwalkan jauh di masa depan & dihapus):
 * 1. Teks + link + 1 gambar → type "link" + meta.url (Facebook preview card native)
 * 2. Link tanpa gambar → type "text", link di-append ke description
 *    (API menolak type link tanpa media: "medias should not be empty")
 *
 * Payload diverifikasi via GET schedule (description terlihat; type & meta
 * diverifikasi dari response doc lengkap).
 */
import { resolve } from "node:path";
import type { ReplizScheduleInput } from "@sahabatkreator/publishing";
import {
  replizActiveCredentials,
  replizCreateSchedule,
  replizListAccounts,
  replizRemoveSchedule,
} from "@sahabatkreator/publishing";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });

let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

const API_BASE = "https://api.repliz.com";

/** Fetch doc schedule mentah — replizGetSchedule tidak expose description */
async function rawScheduleDoc(
  cred: { accessKey: string; secretKey: string },
  scheduleId: string,
): Promise<Record<string, unknown> | null> {
  const auth = `Basic ${Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64")}`;
  const res = await fetch(`${API_BASE}/public/schedule?page=1&limit=50`, {
    headers: { Authorization: auth },
  });
  const docs: Array<Record<string, unknown>> = (await res.json())?.docs ?? [];
  return docs.find((d) => d._id === scheduleId || d.id === scheduleId) ?? null;
}

function appendLinkToText(text: string, link: string): string {
  if (!link) return text;
  if (text.includes(link)) return text;
  return text.trim() ? `${text.trimEnd()}\n\n${link}` : link;
}

async function main() {
  const cred = await replizActiveCredentials();
  if (!cred) {
    console.log("bridge tidak aktif — batal");
    process.exit(1);
  }

  const { docs } = await replizListAccounts(cred);
  const fb = docs.find((d) => d.type === "facebook" && d.isConnected);
  if (!fb) {
    console.log("tidak ada akun facebook bridge — batal");
    process.exit(1);
  }
  console.log(`akun: ${fb.type} @${fb.username} (${fb.id})\n`);

  const scheduleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const link = "https://sahabatkreator.com/e2e-link-test";
  const created: string[] = [];

  // ---- PATH 1: teks + link + 1 gambar → type "link" + meta.url ----
  {
    const description = "Uji coba path link (caption biasa)";
    const medias: ReplizScheduleInput["medias"] = [
      {
        type: "image",
        url: "https://repliz.com/banner.png", // gambar publik (dari docs example)
      },
    ];
    const finalDescription = description.trim() || link;
    const id = await replizCreateSchedule(cred, {
      description: finalDescription,
      type: "link",
      medias,
      accountId: fb.id,
      scheduleAt,
      topic: "facebook",
      meta: { url: link },
    });
    created.push(id);
    const doc = await rawScheduleDoc(cred, id);
    check("path 1: create type link", /^[0-9a-f]{24}$/.test(id), id);
    check("path 1: terdaftar di list", doc !== null);
    check("path 1: type == link", doc?.type === "link");
    check("path 1: meta.url tersimpan", (doc?.meta as { url?: string } | undefined)?.url === link);
    if (doc) {
      check("path 1: description utuh", String(doc.description).includes("Uji coba path link"));
      check("path 1: status pending", doc.status === "pending" || doc.status === "process");
    }
  }

  // ---- PATH 2: link tanpa gambar → type "text", link di-append ke description ----
  {
    const description = "Uji coba link tanpa gambar";
    const medias: ReplizScheduleInput["medias"] = [];
    const finalDescription = appendLinkToText(description, link); // tidak ada gambar → API tolak type link
    const id = await replizCreateSchedule(cred, {
      description: finalDescription,
      type: "text",
      medias,
      accountId: fb.id,
      scheduleAt,
      topic: "facebook",
    });
    created.push(id);
    const doc = await rawScheduleDoc(cred, id);
    check("path 2: create type text", /^[0-9a-f]{24}$/.test(id), id);
    check("path 2: type == text", doc?.type === "text");
    if (doc) {
      const desc = String(doc.description);
      check("path 2: link ter-append ke description", desc.includes(link), desc.slice(0, 70));
      check("path 2: caption asli utuh", desc.includes("Uji coba link tanpa gambar"));
    }
  }

  // ---- PATH 3: link-only tanpa caption + gambar → description fallback link ----
  {
    const description = "";
    const medias: ReplizScheduleInput["medias"] = [
      { type: "image", url: "https://repliz.com/banner.png" },
    ];
    const finalDescription = description.trim() || link;
    const id = await replizCreateSchedule(cred, {
      description: finalDescription,
      type: "link",
      medias,
      accountId: fb.id,
      scheduleAt,
      topic: "facebook",
      meta: { url: link },
    });
    created.push(id);
    const doc = await rawScheduleDoc(cred, id);
    check("path 3: create link-only", /^[0-9a-f]{24}$/.test(id), id);
    if (doc) {
      check("path 3: description fallback = link", String(doc.description) === link);
    }
  }

  // ---- Cleanup: hapus semua schedule uji coba ----
  console.log("\ncleanup:");
  for (const id of created) {
    try {
      await replizRemoveSchedule(cred, id);
      console.log(`  ${id} dihapus`);
    } catch (e) {
      console.log(`  ${id} GAGAL dihapus: ${(e as Error).message}`);
      failures++;
    }
  }

  console.log(`\n${failures === 0 ? "SEMUA PASS" : `${failures} kegagalan`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
