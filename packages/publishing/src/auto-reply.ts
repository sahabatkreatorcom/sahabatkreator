// Engine auto-reply AI — generate balasan komentar/DM dengan delay konfigurabel.
//
// Alur (berbeda dari automation.ts "reply" template yang kirim instan):
//   inbound (dm-sync / engagement-sync) → processAutomation match rule "ai_reply"
//   → insert automationLog status "pending" + dueAt → enqueue delayed job (BullMQ)
//   atau tunggu fallback polling kolom due_at.
//
// Saat due:
//   1. Claim atomik (SET due_at = NULL WHERE status='pending' AND due_at IS NOT NULL)
//      — satu pemenang antara BullMQ vs fallback, mirip pola reminder.ts.
//   2. Muat ulang rule — skip bila nonaktif/dihapus (user bisa matikan selama delay).
//   3. Ambil konteks inbound (teks + socialAccountId + partnerId) dari DB segar:
//      - DM: dm_message + dm_conversation (cek outbound setelah inbound = sudah dibalas)
//      - komentar: engagement_item (cek reply_content = sudah dibalas manual)
//   4. Sentiment guard: negatif → status "skipped" + flag human review (no credit).
//   5. Generate AI reply (1 kredit) + brand voice.
//   6. dryRun → status "drafted" (draft ke engagement_item.draft_reply, review manual).
//      else → kirim via sendDMReply / sendReply → status "sent" / "failed".

import { db } from "@sahabatkreator/db";
import {
  type AutomationAction,
  automationLog,
  automationRule,
  brandVoice,
  dmConversation,
  dmMessage,
  engagementItem,
  plan,
  socialAccount,
  subscription,
} from "@sahabatkreator/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { aiCreditCost, chatCompletion, consumeAiCredits, getAiConfig } from "./ai";
import { decrypt } from "./crypto";
import { sendDMReply } from "./dm-sync";
import { sendReply } from "./reply";
import { detectNegative } from "./sentiment";

/** Batas kredit AI org bulan ini (tier → plan.aiCreditsPerMonth) */
async function getOrgAiCreditLimit(organizationId: string): Promise<number> {
  const [sub] = await db
    .select({
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1);

  let tier: "free" | "pro" | "business" | "enterprise" = "free";
  if (
    sub &&
    sub.status === "active" &&
    (!sub.currentPeriodEnd || sub.currentPeriodEnd >= new Date())
  ) {
    tier = sub.tier;
  }

  const [row] = await db
    .select({ aiCreditsPerMonth: plan.aiCreditsPerMonth })
    .from(plan)
    .where(and(eq(plan.tier, tier), eq(plan.billingIntervalMonths, 1), eq(plan.isActive, true)))
    .limit(1);

  return row?.aiCreditsPerMonth ?? 0;
}

/** Brand voice org sebagai instruksi prompt (sama pola dengan apps/server ai.ts) */
async function brandVoicePrompt(organizationId: string): Promise<string> {
  const [voice] = await db
    .select({
      description: brandVoice.description,
      tones: brandVoice.tones,
      vocabulary: brandVoice.vocabulary,
      avoid: brandVoice.avoid,
    })
    .from(brandVoice)
    .where(eq(brandVoice.organizationId, organizationId))
    .limit(1);
  if (!voice) return "";

  const parts: string[] = [];
  if (voice.description) parts.push(voice.description);
  if (voice.tones.length > 0) parts.push(`Tone wajib: ${voice.tones.join(", ")}`);
  if (voice.vocabulary.length > 0)
    parts.push(`Kosakata khas: ${voice.vocabulary.slice(0, 10).join(", ")}`);
  if (voice.avoid.length > 0) parts.push(`Hindari: ${voice.avoid.join(", ")}`);
  return parts.length > 0 ? `\nKonteks brand voice:\n${parts.join("\n")}` : "";
}

type InboundContext = {
  text: string;
  socialAccountId: string;
  /** DM saja — partner platform ID untuk kirim balasan */
  partnerId: string | null;
  /** DM saja — chat ID Repliz untuk akun bridge (dm_conversation.platform_conversation_id) */
  chatId: string | null;
  /** true bila sudah ada reply manual/outbound — skip auto-reply */
  alreadyReplied: boolean;
  /** engagement_item.id (komentar) — untuk tulis sentiment/draft reply */
  engagementItemId: string | null;
};

/**
 * Ambil konteks inbound dari DB (segar — refleksi kondisi terkini, termasuk
 * bila user membalas manual selama window delay).
 */
async function resolveInbound(
  log: typeof automationLog.$inferSelect,
): Promise<InboundContext | null> {
  if (log.source === "dm") {
    const [msg] = await db
      .select({
        text: dmMessage.text,
        socialAccountId: dmMessage.socialAccountId,
        conversationId: dmMessage.conversationId,
        occurredAt: dmMessage.occurredAt,
      })
      .from(dmMessage)
      .where(
        and(
          eq(dmMessage.platformMessageId, log.platformItemId),
          eq(dmMessage.organizationId, log.organizationId),
        ),
      )
      .limit(1);
    if (!msg) return null;

    const [conv] = await db
      .select({
        partnerId: dmConversation.partnerId,
        platformConversationId: dmConversation.platformConversationId,
      })
      .from(dmConversation)
      .where(eq(dmConversation.id, msg.conversationId))
      .limit(1);

    // Sudah dibalas manual? ada outbound di percakapan yang sama setelah pesan ini
    const [outbound] = await db
      .select({ id: dmMessage.id })
      .from(dmMessage)
      .where(
        and(
          eq(dmMessage.conversationId, msg.conversationId),
          eq(dmMessage.direction, "outbound"),
          gte(dmMessage.occurredAt, msg.occurredAt),
        ),
      )
      .limit(1);

    return {
      text: msg.text ?? "",
      socialAccountId: msg.socialAccountId,
      partnerId: conv?.partnerId ?? null,
      chatId: conv?.platformConversationId ?? null,
      alreadyReplied: Boolean(outbound),
      engagementItemId: null,
    };
  }

  // komentar
  const [item] = await db
    .select({
      id: engagementItem.id,
      content: engagementItem.content,
      socialAccountId: engagementItem.socialAccountId,
      replyContent: engagementItem.replyContent,
    })
    .from(engagementItem)
    .where(
      and(
        eq(engagementItem.platformItemId, log.platformItemId),
        eq(engagementItem.organizationId, log.organizationId),
      ),
    )
    .limit(1);

  if (!item) return null;
  return {
    text: item.content ?? "",
    socialAccountId: item.socialAccountId,
    partnerId: null,
    chatId: null,
    alreadyReplied: Boolean(item.replyContent),
    engagementItemId: item.id,
  };
}

export type AutoReplyResult = {
  status: "sent" | "drafted" | "skipped" | "failed" | "noop";
  message?: string;
};

/**
 * Proses satu job auto-reply (idempoten, claim-based).
 * Dipanggil worker BullMQ & fallback polling.
 */
export async function processAutoReplyJob(logId: string): Promise<AutoReplyResult> {
  // 1. Claim atomik: null-kan due_at hanya bila masih pending — race BullMQ vs
  // fallback aman (satu pemenang), mirip processPostReminder.
  const [claimed] = await db
    .update(automationLog)
    .set({ dueAt: null })
    .where(
      and(
        eq(automationLog.id, logId),
        eq(automationLog.status, "pending"),
        isNotNull(automationLog.dueAt),
      ),
    )
    .returning({
      id: automationLog.id,
      organizationId: automationLog.organizationId,
      ruleId: automationLog.ruleId,
      source: automationLog.source,
      platformItemId: automationLog.platformItemId,
    });

  if (!claimed) return { status: "noop" }; // sudah diproses / di-claim worker lain

  const finish = async (
    error: string,
    status: "failed" | "skipped" = "failed",
  ): Promise<AutoReplyResult> => {
    await db.update(automationLog).set({ status, error }).where(eq(automationLog.id, logId));
    return { status, message: error };
  };

  // 2. Muat rule — bisa diubah/dinonaktifkan selama window delay
  const [rule] = await db
    .select({
      id: automationRule.id,
      action: automationRule.action,
      isActive: automationRule.isActive,
    })
    .from(automationRule)
    .where(eq(automationRule.id, claimed.ruleId))
    .limit(1);

  if (!rule?.isActive || rule.action.type !== "ai_reply") {
    return await finish("rule_nonaktif_atau_dihapus", "skipped");
  }
  const action = rule.action as Extract<AutomationAction, { type: "ai_reply" }>;

  // 3. Konteks inbound
  const inbound = await resolveInbound(claimed as typeof automationLog.$inferSelect);
  if (!inbound) {
    return await finish("inbound_item_tidak_ditemukan", "skipped");
  }

  // 4. Sudah dibalas manual selama delay → skip (jangan double-reply)
  if (inbound.alreadyReplied) {
    return await finish("sudah_dibalas_manual", "skipped");
  }

  // 5. Sentiment guard — negatif: skip auto-reply publik, flag human review.
  // Murah (tanpa kredit); false-positive hanya menunda auto-reply (aman).
  const sentiment = detectNegative(inbound.text);
  if (sentiment.negative) {
    if (inbound.engagementItemId && claimed.source === "comment") {
      await db
        .update(engagementItem)
        .set({ sentiment: "negative" })
        .where(eq(engagementItem.id, inbound.engagementItemId));
    }
    return await finish(`sentimen_negatif:${sentiment.reason}`, "skipped");
  }

  // 6. Generate AI reply
  const config = await getAiConfig();
  if (!config) {
    return await finish("ai_belum_dikonfigurasi");
  }

  const limit = await getOrgAiCreditLimit(claimed.organizationId);
  if (limit <= 0) {
    return await finish("plan_tanpa_kredit_ai");
  }

  try {
    await consumeAiCredits(claimed.organizationId, limit, {
      action: "reply",
      platform: claimed.source === "dm" ? "instagram" : undefined,
      model: config.model,
      credits: aiCreditCost("reply"),
    });
  } catch (error) {
    return await finish(error instanceof Error ? error.message : "kredit_habis");
  }

  const voice = await brandVoicePrompt(claimed.organizationId);
  const system =
    "Kamu adalah admin social media yang menanggapi komentar/pesan pelanggan/follower. " +
    `Balas dengan gaya ${action.tone} dalam Bahasa Indonesia.\n` +
    "Maksimal 2-3 kalimat. Jika komentar negatif, tunjukkan empati dan tawarkan solusi.\n" +
    `Kembalikan HANYA teks balasan tanpa tanda kutip atau prefix apapun.${voice}`;

  let replyText: string;
  try {
    replyText = await chatCompletion(config, system, inbound.text, {
      temperature: 0.75,
      maxTokens: 300,
    });
  } catch (error) {
    return await finish(error instanceof Error ? error.message : "ai_gagal_generate");
  }

  // 7a. Dry-run: simpan draft untuk review manual di inbox
  if (action.dryRun) {
    await db
      .update(automationLog)
      .set({ status: "drafted", messageSent: replyText })
      .where(eq(automationLog.id, logId));
    if (inbound.engagementItemId) {
      await db
        .update(engagementItem)
        .set({ draftReply: replyText })
        .where(eq(engagementItem.id, inbound.engagementItemId));
    }
    return { status: "drafted", message: replyText };
  }

  // 7b. Kirim reply ke platform
  const [account] = await db
    .select({
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(eq(socialAccount.id, inbound.socialAccountId))
    .limit(1);

  if (!account) {
    return await finish("akun_tidak_ditemukan");
  }
  // Akun bridge Repliz: token platform disimpan Repliz — kirim reply via API
  // Repliz (dispatch di sendReply/sendDMReply via accountMetadata).
  if (!account.accessTokenEnc && !account.metadata?.replizAccountId) {
    return await finish("akun_tidak_ditemukan");
  }
  const accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : "";

  try {
    let platformReplyId: string;
    if (claimed.source === "dm") {
      if (!inbound.partnerId) throw new Error("DM tanpa partnerId");
      if (
        account.platform !== "instagram" &&
        account.platform !== "instagram_standalone" &&
        account.platform !== "facebook"
      ) {
        throw new Error(`Auto-reply DM tidak didukung untuk ${account.platform}`);
      }
      const res = await sendDMReply({
        platform: account.platform,
        accessToken,
        platformAccountId: account.platformAccountId,
        partnerId: inbound.partnerId,
        text: replyText,
        accountMetadata: account.metadata ?? null,
        chatId: inbound.chatId,
      });
      platformReplyId = res.platformMessageId;
    } else {
      const res = await sendReply({
        platform: account.platform,
        accessToken,
        platformItemId: claimed.platformItemId,
        itemType: "comment",
        content: replyText,
        platformAccountId: account.platformAccountId,
        accountMetadata: account.metadata ?? null,
      });
      platformReplyId = res.replyId;
    }

    await db
      .update(automationLog)
      .set({ status: "sent", messageSent: replyText, platformReplyId })
      .where(eq(automationLog.id, logId));
    await db
      .update(automationRule)
      .set({ deliveredCount: sql`${automationRule.deliveredCount} + 1` })
      .where(eq(automationRule.id, rule.id));
    return { status: "sent", message: replyText };
  } catch (error) {
    return await finish(error instanceof Error ? error.message : "gagal_kirim");
  }
}
