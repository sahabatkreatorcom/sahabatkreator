import { config } from "dotenv";
import { resolve } from "node:path";
import {
  replizActiveCredentials,
  replizGetContentStatistic,
  replizCreateComment,
} from "../../../packages/publishing/src/repliz";

config({ path: resolve(process.cwd(), ".env") });

const ACC_FB = "6ab0bc4462caae1e043926ae"; // Sahabat Kreator FB
const ACC_LI = "6ab0b51a62caae1e04390ab0"; // Sahabat Kreator LinkedIn org
const CONTENT_FB = "622205640985000_122187789350907803";
const CONTENT_LI = "urn:li:share:7507660701029584898";

async function main() {
  const cred = await replizActiveCredentials();
  if (!cred) { console.log("bridge null"); process.exit(0); }

  console.log("=== statistic FB (content pipeline kita)");
  try {
    const s = await replizGetContentStatistic(cred, CONTENT_FB, ACC_FB);
    console.log("  ", JSON.stringify(s));
  } catch (e) {
    console.log("  error:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== statistic LinkedIn org (content pipeline, fc=YES)");
  try {
    const s = await replizGetContentStatistic(cred, CONTENT_LI, ACC_LI);
    console.log("  ", JSON.stringify(s));
  } catch (e) {
    console.log("  error:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== create-comment endpoint (contentId dummy → harus 404, bukan 400)");
  try {
    const r = await replizCreateComment(cred, "dummy_content_id_test", ACC_FB, "[diagnostik]");
    console.log("  replyId:", r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("  error:", msg.slice(0, 250));
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
