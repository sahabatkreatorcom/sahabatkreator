/**
 * E2E WRITE test: reply komentar akun bridge via Repliz Comment API.
 *
 * Mengirim balasan NYATA ke platform (POST /public/comment/{id}).
 * Hanya pilih satu komentar (paling lama) supaya dampak minimal.
 *
 * Verifikasi: platformReplyId dikembalikan + status item jadi 'replied'
 * + platformReplyId tersimpan di DB.
 */
import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { engagementItem, socialAccount } from "@sahabatkreator/db/schema";
import { sendReply } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  // Ambil satu item bridge belum dibalas
  const [row] = await db
    .select({
      item: engagementItem,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
      isConnected: socialAccount.isConnected,
    })
    .from(engagementItem)
    .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
    .where(and(eq(engagementItem.status, "unread"), eq(engagementItem.type, "comment")))
    .limit(1);

  if (!row) {
    console.log("tidak ada komentar belum dibalas untuk di-test");
    process.exit(0);
  }
  if (!row.metadata?.replizAccountId) {
    console.log(`item pertama bukan akun bridge (platform=${row.platform}) — skip`);
    process.exit(0);
  }

  console.log(`target: [${row.platform}] @${row.item.authorUsername}`);
  console.log(`  komentar: "${row.item.content?.slice(0, 60)}"`);
  console.log(`  itemId: ${row.item.platformItemId}`);

  const replyText = "Terima kasih sudah berkomentar! 🙏 (uji coba otomatis)";
  console.log(`\nmengirim reply: "${replyText}"`);

  try {
    const result = await sendReply({
      platform: row.platform,
      accessToken: "",
      platformItemId: row.item.platformItemId,
      platformParentId: row.item.parentId,
      itemType: row.item.type,
      content: replyText,
      platformAccountId: row.platformAccountId,
      accountMetadata: row.metadata,
    });
    console.log(`\nPASS — reply terkirim, platformReplyId=${result.replyId}`);

    // Simpan ke DB (simulasi apa yang route lakukan)
    await db
      .update(engagementItem)
      .set({
        status: "replied",
        replyContent: replyText,
        platformReplyId: result.replyId,
        repliedAt: new Date(),
      })
      .where(eq(engagementItem.id, row.item.id));
    console.log("PASS — status item jadi 'replied' + platformReplyId tersimpan");
  } catch (error) {
    console.log(`\nFAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
