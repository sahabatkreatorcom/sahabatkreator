#!/usr/bin/env node
// =============================================================================
// Test DM Permissions — Node.js version untuk dijalankan di Docker container
//
// Usage (inside container):
//   docker exec sahabatkreator-app node /app/apps/server/scripts/test-dm-node.js
//
// Atau dari host:
//   docker exec sahabatkreator-app node scripts/test-dm-node.js
// =============================================================================

const GRAPH_API = "https://graph.facebook.com/v26.0";
const IG_ACCOUNT_ID = "17841475755074774";
const FB_ACCOUNT_ID = "622205640985000";

async function fetchConversations(token, accountId, platform) {
  const params = new URLSearchParams({
    fields: "id,updated_time,participants",
    limit: "5",
    access_token: token,
  });
  if (platform === "instagram") {
    params.set("platform", "instagram");
  }

  const url = `${GRAPH_API}/${accountId}/conversations?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log("=== DM Permission Test — Meta App Review ===\n");

  // Read tokens from environment or use placeholders
  const igToken = process.env.IG_TOKEN || "";
  const fbToken = process.env.FB_TOKEN || "";

  if (!igToken && !fbToken) {
    console.log("No tokens provided via environment variables.");
    console.log("");
    console.log("Usage:");
    console.log("  docker exec sahabatkreator-app sh -c '");
    console.log("    IG_TOKEN=your_instagram_token FB_TOKEN=your_facebook_token \\");
    console.log("    node /app/apps/server/scripts/test-dm-node.js");
    console.log("  '");
    console.log("");
    console.log("How to get tokens:");
    console.log("  1. Open https://developers.facebook.com/tools/explorer/");
    console.log("  2. Select app: Sahabat Kreator");
    console.log("  3. Generate token with permissions:");
    console.log("     - instagram_manage_messages");
    console.log("     - pages_messaging");
    console.log("  4. Copy the token");
    process.exit(1);
  }

  // --- Instagram DM Test ---
  if (igToken) {
    console.log("=== Instagram DM (instagram_business_manage_messages) ===");
    console.log(`Account: ${IG_ACCOUNT_ID}`);
    console.log("Calls needed: 10\n");

    for (let i = 1; i <= 10; i++) {
      process.stdout.write(`  [${i}/10] `);
      try {
        const { status, data } = await fetchConversations(igToken, IG_ACCOUNT_ID, "instagram");
        if (status === 200) {
          const count = data.data?.length ?? 0;
          console.log(`✅ 200 OK (${count} conversations)`);
        } else {
          const msg = data.error?.message ?? "Unknown error";
          console.log(`❌ ${status} — ${msg.slice(0, 80)}`);
        }
      } catch (e) {
        console.log(`❌ Error: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log("\n✅ Instagram: 10 calls completed\n");
  }

  // --- Facebook DM Test ---
  if (fbToken) {
    console.log("=== Facebook DM (pages_messaging) ===");
    console.log(`Page: ${FB_ACCOUNT_ID}`);
    console.log("Calls needed: 10\n");

    for (let i = 1; i <= 10; i++) {
      process.stdout.write(`  [${i}/10] `);
      try {
        const { status, data } = await fetchConversations(fbToken, FB_ACCOUNT_ID, "facebook");
        if (status === 200) {
          const count = data.data?.length ?? 0;
          console.log(`✅ 200 OK (${count} conversations)`);
        } else {
          const msg = data.error?.message ?? "Unknown error";
          console.log(`❌ ${status} — ${msg.slice(0, 80)}`);
        }
      } catch (e) {
        console.log(`❌ Error: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log("\n✅ Facebook: 10 calls completed\n");
  }

  console.log("=== NEXT STEPS ===");
  console.log("1. Open: https://developers.facebook.com/apps/");
  console.log("2. Select app → App Review → Permissions and Features");
  console.log("3. Check 'panggilan API uji' count increased");
  console.log("4. Submit for review");
}

main().catch(console.error);
