// Engine automation — evaluasi keyword trigger pada DM/komentar inbound, kirim auto-reply
//
// Desain dari riset reference app (dm-automation.ts + comment-responder.ts):
// - Sequential rules → first-match-wins (rule pertama yang cocok dieksekusi)
// - Placeholder personalisasi {{username}} {{name}} {{keyword}}
// - Stats counter triggered/delivered di tabel rule
// Normalisasi tambahan:
// - Dedup via unique (ruleId, platformItemId) di automation_log — idempoten lintas
//   webhook/polling; insert log jadi guard (conflict = sudah pernah dieksekusi)
// - Aksi reply memakai sendDMReply (DM) / sendReply (komentar) yang sudah ada

import { db } from "@sahabatkreator/db";
import { automationLog, automationRule, type AutomationAction } from "@sahabatkreator/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { enqueueAutoReply } from "./queue-hook";
import { decrypt } from "./crypto";
import { sendDMReply } from "./dm-sync";
import { sendReply } from "./reply";

function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

/** Item inbound yang dievaluasi engine */
export type AutomationInput = {
  organizationId: string;
  socialAccountId: string;
  source: "dm" | "comment";
  /** platformMessageId (DM) / platformItemId (komentar) — kunci dedup */
  platformItemId: string;
  /** Teks pesan/komentar inbound (untuk keyword match) */
  text: string;
  partnerName?: string | null;
  partnerUsername?: string | null;
  /** DM saja: partner platform ID untuk kirim balasan */
  partnerId?: string | null;
};

export type AutomationOutcome = {
  matched: boolean;
  ruleId?: string;
  ruleName?: string;
  status?: "sent" | "failed";
  error?: string;
};

/** Ganti placeholder personalisasi di template pesan */
export function personalize(template: string, input: AutomationInput, keyword: string): string {
  return template
    .replaceAll("{{username}}", input.partnerUsername ?? input.partnerName ?? "Kak")
    .replaceAll("{{name}}", input.partnerName ?? input.partnerUsername ?? "Kak")
    .replaceAll("{{keyword}}", keyword);
}

/** Cari rule pertama yang cocok — first-match-wins */
async function findMatchingRule(
  input: AutomationInput,
): Promise<{ rule: typeof automationRule.$inferSelect; keyword: string } | null> {
  const rules = await db
    .select()
    .from(automationRule)
    .where(
      and(
        eq(automationRule.organizationId, input.organizationId),
        eq(automationRule.isActive, true),
        eq(automationRule.source, input.source),
        or(
          isNull(automationRule.socialAccountId),
          eq(automationRule.socialAccountId, input.socialAccountId),
        ),
      ),
    );

  const textLower = input.text.toLowerCase();
  for (const rule of rules) {
    const keyword = (rule.triggers ?? []).find((k) => k && textLower.includes(k.toLowerCase()));
    if (keyword !== undefined) {
      return { rule, keyword };
    }
  }
  return null;
}

/**
 * Rencana eksekusi per jenis aksi (type-safe narrowing).
 * ai_reply → status "pending" + dueAt (delay); reply → "sent" + langsung kirim.
 */
function planExecution(action: AutomationAction): {
  status: "pending" | "sent";
  dueAt: Date | null;
} {
  if (action.type === "ai_reply") {
    return {
      status: "pending",
      dueAt: new Date(Date.now() + Math.max(action.delayMinutes, 0) * 60_000),
    };
  }
  return { status: "sent", dueAt: null };
}

/**
 * Proses satu item inbound terhadap aturan automation.
 * Dipanggil dari dm-sync (pesan baru) & engagement-sync (komentar baru) —
 * best-effort: error TIDAK menggagalkan sync, hanya dicatat ke log.
 */
export async function processAutomation(input: AutomationInput): Promise<AutomationOutcome> {
  try {
    const match = await findMatchingRule(input);
    if (!match) return { matched: false };

    const { rule, keyword } = match;
    if (rule.action.type !== "reply" && rule.action.type !== "ai_reply") {
      return { matched: false };
    }

    // Guard dedup: insert log dulu — conflict berarti item ini sudah diproses rule ini
    const logId = generateId("autolog");
    const plan = planExecution(rule.action);
    const inserted = await db
      .insert(automationLog)
      .values({
        id: logId,
        organizationId: input.organizationId,
        ruleId: rule.id,
        source: input.source,
        platformItemId: input.platformItemId,
        partnerName: input.partnerName ?? null,
        partnerUsername: input.partnerUsername ?? null,
        messageSent: null,
        status: plan.status,
        dueAt: plan.dueAt,
      })
      .onConflictDoNothing({ target: [automationLog.ruleId, automationLog.platformItemId] })
      .returning({ id: automationLog.id });

    if (inserted.length === 0) {
      return { matched: false }; // sudah dieksekusi sebelumnya (webhook + polling)
    }

    // triggeredCount naik SEKALI per eksekusi unik (tidak peduli kirim sukses/gagal —
    // deliveredCount hanya naik saat kirim sukses)
    await db
      .update(automationRule)
      .set({
        triggeredCount: sql`${automationRule.triggeredCount} + 1`,
        lastTriggeredAt: new Date(),
      })
      .where(eq(automationRule.id, rule.id));

    // ---- AI reply: jangan kirim sekarang — enqueue delayed job (delay memberi
    // buffer: cek sentimen segar, cek sudah-dibalas-manual, hindari pola bot).
    // Eksekusi & semua guard ada di processAutoReplyJob (queue worker / fallback).
    if (rule.action.type === "ai_reply") {
      const queued = await enqueueAutoReply(logId, plan.dueAt as Date).catch((err) => {
        console.warn(`[automation] enqueue ai_reply gagal: ${err}`);
        return false;
      });
      if (!queued) {
        // Hook belum terdaftar (tanpa host app) atau Redis tidak ada → fallback
        // polling automation_log.due_at akan memproses. dueAt sudah di DB.
        console.log(`[automation] ai_reply log=${logId} menunggu fallback polling`);
      }
      return {
        matched: true,
        ruleId: rule.id,
        ruleName: rule.name,
        // status final (sent/drafted/skipped/failed) ditentukan worker saat due;
        // di sini baru konfirmasi trigger — balasan belum terkirim.
      };
    }

    // ---- Template reply: kirim langsung (perilaku lama)

    // Ambil konteks akun untuk kirim reply
    const { socialAccount } = await import("@sahabatkreator/db/schema");
    const [account] = await db
      .select()
      .from(socialAccount)
      .where(eq(socialAccount.id, input.socialAccountId));
    if (!account?.accessTokenEnc) {
      await db
        .update(automationLog)
        .set({ status: "failed", error: "Akun sosial tidak ditemukan / tanpa token" })
        .where(eq(automationLog.id, logId));
      return {
        matched: true,
        ruleId: rule.id,
        ruleName: rule.name,
        status: "failed",
        error: "no_account",
      };
    }
    const accessToken = decrypt(account.accessTokenEnc);

    const message = personalize(rule.action.message, input, keyword);

    // Kirim reply sesuai source
    let platformReplyId: string;
    if (input.source === "dm") {
      if (!input.partnerId) throw new Error("DM tanpa partnerId");
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
        partnerId: input.partnerId,
        text: message,
      });
      platformReplyId = res.platformMessageId;
    } else {
      const res = await sendReply({
        platform: account.platform,
        accessToken,
        platformItemId: input.platformItemId,
        itemType: "comment",
        content: message,
        platformAccountId: account.platformAccountId,
        accountMetadata: account.metadata ?? null,
      });
      platformReplyId = res.replyId;
    }

    // Update log sukses + delivered stats rule
    await db
      .update(automationLog)
      .set({ messageSent: message, platformReplyId })
      .where(eq(automationLog.id, logId));
    await db
      .update(automationRule)
      .set({
        deliveredCount: sql`${automationRule.deliveredCount} + 1`,
      })
      .where(eq(automationRule.id, rule.id));

    return { matched: true, ruleId: rule.id, ruleName: rule.name, status: "sent" };
  } catch (err) {
    // Catat failure tanpa menggagalkan sync — log row mungkin sudah ter-insert
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[automation] gagal: ${message}`);
    return { matched: true, status: "failed", error: message };
  }
}
