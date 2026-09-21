/**
 * Verifikasi read-only untuk sinkronisasi komentar akun bridge.
 * Menguji FUNGSI LIBRARY yang dipakai syncRepliz (bukan URL manual), sehingga
 * yang divalidasi adalah perilaku kode produksi sebenarnya.
 *
 *  1. Filter account ditegakkan (komentar tidak bocor antar akun bridge)
 *  2. Mapping field menghasilkan content/author terisi
 *
 * Hanya GET — tidak ada panggilan write (reply/delete).
 */
import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import { replizActiveCredentials, replizListComments } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const cred = await replizActiveCredentials();
  if (!cred) {
    console.log("FAIL bridge tidak aktif");
    process.exit(1);
  }

  const accounts = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      username: socialAccount.username,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(eq(socialAccount.isConnected, true));

  const bridge = accounts.filter((a) => a.metadata?.replizAccountId);
  console.log(`bridge accounts: ${bridge.length}\n`);

  let leak = 0;
  let emptyFields = 0;
  let total = 0;
  const perAccount: string[] = [];

  for (const a of bridge) {
    const replizAccountId = a.metadata?.replizAccountId as string;
    const { docs } = await replizListComments(cred, replizAccountId, {
      page: 1,
      limit: 10,
      status: "pending",
    });
    perAccount.push(`${a.platform} (@${a.username}): ${docs.length}`);
    for (const d of docs) {
      total++;
      if (d.accountId !== replizAccountId) {
        leak++;
        console.log(
          `  LEAK ${a.platform}: doc accountId=${d.accountId} (expected ${replizAccountId})`,
        );
      }
      const handle = d.comment?.owner?.name;
      const text = d.comment?.text;
      if (!handle || !text) {
        emptyFields++;
        console.log(
          `  EMPTY ${a.platform} doc=${d._id}: name=${handle ?? "-"} text=${text ? "ok" : "-"}`,
        );
      }
    }
  }

  for (const line of perAccount) console.log(`  ${line} pending comment(s)`);
  console.log("");
  console.log(`total docs: ${total} | leaks: ${leak} | missing fields: ${emptyFields}`);
  console.log("");
  console.log(
    leak === 0 && emptyFields === 0
      ? "PASS comment-sync filter & mapping"
      : "REVIEW ada temuan di atas",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
