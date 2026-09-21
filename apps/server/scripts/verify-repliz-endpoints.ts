// Verifikasi read-only endpoint bridge Repliz yang baru diimplementasi.
// Hanya GET (tidak ada write/post/delete) — aman dijalankan di produksi.
// Jalankan: bun scripts/verify-repliz-endpoints.ts (dari apps/server)
//
// Endpoint yang diverifikasi:
// 1. GET /public/comment (sumber sync komentar)
// 2. GET /public/chat (sumber sync DM)
// 3. GET /public/chat/{chatId}/message (butuh chatId dari #2)
// 4. GET /public/content?accountId=&type=media (sumber posts-sync)
// 5. GET /public/content/{contentId}/statistic?accountId= (analytics post)
// 6. Probe: GET /public/account/{accountId}/statistic (eksplorasi — belum ada docs)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { bridgeConfig } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

const API_BASE = "https://api.repliz.com";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function pass(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function get(cred: { accessKey: string; secretKey: string }, path: string) {
  const auth = Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64");
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Basic ${auth}` } });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // body bukan JSON (mis. 204)
  }
  return { status: res.status, json, text };
}

async function main() {
  const [cfg] = await db
    .select()
    .from(bridgeConfig)
    .where(eq(bridgeConfig.provider, "repliz"))
    .limit(1);

  if (!cfg?.isActive) {
    console.log("Bridge Repliz tidak aktif — tidak ada yang bisa diverifikasi.");
    process.exit(1);
  }
  const { decrypt } = await import("../src/lib/crypto");
  const cred = { accessKey: cfg.accessKey, secretKey: decrypt(cfg.secretEnc) };

  // --- 1. List akun (ambil accountId & generatedId untuk cek berikutnya) ---
  const accountsRes = await get(cred, "/public/account?page=1&limit=20");
  const accountsBody = accountsRes.json as {
    docs?: Array<{
      id: string;
      generatedId: string;
      name: string;
      type: string;
      isConnected: boolean;
    }>;
  } | null;
  const accounts = accountsBody?.docs ?? [];
  pass(
    "list-accounts",
    accountsRes.status === 200 && accounts.length > 0,
    `${accountsRes.status} — ${accounts.length} akun (${accounts.map((a) => a.type).join(", ")})`,
  );
  if (accounts.length === 0) {
    console.log("\nTidak ada akun — hentikan.");
    finish();
    return;
  }

  // Akun dengan platform yang punya chat (FB/IG) + akun dengan content
  const firstAccount = accounts[0];
  const chatAccount =
    accounts.find((a) => a.type === "facebook" || a.type === "instagram") ?? firstAccount;

  // --- 2. List komentar (pending) ---
  // Filter account WAJIB `accountIds[]` — bentuk `accountIds=` diabaikan API
  // (diverifikasi: bentuk salah mengembalikan comment seluruh workspace).
  const commentsRes = await get(
    cred,
    `/public/comment?page=1&limit=5&status=pending&accountIds[]=${encodeURIComponent(firstAccount.id)}`,
  );
  const commentsBody = commentsRes.json as { docs?: Array<Record<string, unknown>> } | null;
  const comments = commentsBody?.docs ?? [];
  // Mapping syncRepliz membaca nested comment.text & comment.owner — assert ada
  const commentShape = comments[0]
    ? [
        "_id" in comments[0] ? "_id" : null,
        comments[0].comment ? "comment{text,owner}" : null,
        comments[0].content ? "content" : null,
        "status" in comments[0] ? "status" : null,
      ]
        .filter(Boolean)
        .join(",")
    : "—";
  const nestedOk = comments.every(
    (c) =>
      c.comment &&
      typeof (c.comment as { text?: string }).text === "string" &&
      (c.comment as { owner?: { name?: string } }).owner?.name,
  );
  pass(
    "list-comments",
    commentsRes.status === 200 && (comments.length === 0 || nestedOk),
    `${commentsRes.status} — ${comments.length} komentar pending (fields: ${commentShape})`,
  );

  // --- 3. List chat (hanya untuk akun FB/IG) ---
  const chatsRes = await get(
    cred,
    `/public/chat?page=1&limit=5&accountIds[]=${encodeURIComponent(chatAccount.id)}`,
  );
  const chatsBody = chatsRes.json as {
    docs?: Array<{
      _id: string;
      senderName?: string;
      unreadCount?: number;
      lastMessage?: { messageId: string; isFromMe: boolean; text?: string; sendAt?: string };
    }>;
  } | null;
  const chats = chatsBody?.docs ?? [];
  pass(
    "list-chats",
    chatsRes.status === 200,
    `${chatsRes.status} — ${chats.length} chat untuk akun ${chatAccount.type} (Gold+ syarat)`,
  );

  // --- 4. List pesan chat pertama (bila ada chat) ---
  if (chats.length > 0) {
    const chat = chats[0];
    const msgsRes = await get(cred, `/public/chat/${chat._id}/message?page=1&limit=10`);
    const msgsBody = msgsRes.json as {
      docs?: Array<{
        messageId: string;
        isFromMe: boolean;
        text?: string;
        createdAt?: string;
        senderId?: string;
      }>;
    } | null;
    const msgs = msgsBody?.docs ?? [];
    // Cek urutan: createdAt DESCENDING (pesan terbaru di page 1)?
    const times = msgs
      .map((m) => (m.createdAt ? Date.parse(m.createdAt) : Number.NaN))
      .filter((t) => !Number.isNaN(t));
    const isDesc = times.length > 1 && times.every((t, i) => i === 0 || times[i - 1] >= t);
    pass(
      "list-chat-messages",
      msgsRes.status === 200 && msgs.length > 0,
      `${msgsRes.status} — ${msgs.length} pesan; urut createdAt ${isDesc ? "DESC (terbaru di page 1)" : "ASC/belum tentu"}`,
    );
  } else {
    pass("list-chat-messages", true, "skip — tidak ada chat di akun FB/IG");
  }

  // --- 5. List content (media) ---
  const contentRes = await get(
    cred,
    `/public/content?accountId=${encodeURIComponent(firstAccount.id)}&type=media`,
  );
  const contentBody = contentRes.json as {
    docs?: Array<Record<string, unknown>>;
    nextToken?: string;
  } | null;
  const contents = contentBody?.docs ?? [];
  const contentShape = contents[0]
    ? Object.keys(contents[0])
        .filter((k) =>
          [
            "id",
            "title",
            "description",
            "type",
            "medias",
            "url",
            "createdAt",
            "statistic",
          ].includes(k),
        )
        .join(",")
    : "—";
  pass(
    "list-content",
    contentRes.status === 200,
    `${contentRes.status} — ${contents.length} konten (fields: ${contentShape})`,
  );

  // --- 6. Content statistic (bila ada konten) ---
  if (contents.length > 0) {
    const contentId = String(contents[0].id ?? "");
    const statRes = await get(
      cred,
      `/public/content/${encodeURIComponent(contentId)}/statistic?accountId=${encodeURIComponent(firstAccount.id)}`,
    );
    const stat = statRes.json as Record<string, number> | null;
    pass(
      "content-statistic",
      statRes.status === 200 && stat !== null,
      `${statRes.status} — ${stat ? JSON.stringify(stat) : statRes.text.slice(0, 120)}`,
    );
  } else {
    pass("content-statistic", true, "skip — tidak ada konten");
  }

  // Catatan: snapshot metrik account-level utk bridge sengaja tidak diambil
  // (Account API Repliz tidak mengekspos follower count — lihat analytics-sync).
  // Metrik post-level pakai /public/content/{id}/statistic (cek #6 di atas).

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} cek lulus.`);
  if (failed.length > 0) {
    console.log("Gagal:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("verify-repliz-endpoints gagal:", e);
  process.exit(1);
});
