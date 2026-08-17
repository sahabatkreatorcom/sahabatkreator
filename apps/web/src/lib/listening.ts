import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

const POSITIVE_WORDS = [
    "suka", "keren", "bagus", "mantap", "cinta", "best", "great", "love", "amazing",
    "awesome", "excellent", "good", "nice", "top", "recommended", "rekomendasi",
    "recommend", "nyaman", "puas", "puas banget", "terbaik", "favorite", "favorit",
    "cakep", "gacor", "wow", "menakjubkan", "luar biasa", "oke", "ok",
];

const NEGATIVE_WORDS = [
    "buruk", "jelek", "payah", "bencana", "mengecewakan", "kecewa", "parah", "sampah",
    "bad", "terrible", "awful", "worst", "disappoint", "disappointed", "hate", "miskin",
    "cacat", "rusak", "spam", "scam", "penipuan", "penipu", "jelek banget", "gak jelas",
    "tidak jelas", "mahal", "lambat", "lemot", "error", "bug", "gagal", "hancur",
];

const QUESTION_WORDS = [
    "?", "berapa", "bagaimana", "kenapa", "mengapa", "kapan", "dimana", "di mana",
    "harga", "how", "what", "why", "when", "where", "which", "who", "can", "bisa",
    "tersedia", "stok", "order", "pesan", "how much", "how to",
];

export interface PendingListeningItem {
    sourceType: string;
    sourceId: string;
    platform: string;
    socialAccountId?: string;
    externalUrl?: string | null;
    authorName: string;
    authorAvatar?: string | null;
    content: string;
    mediaUrl?: string | null;
    occurredAt: Date;
}

/** Ambil percakapan tersinkronisasi (komentar/mention/review/DM) untuk organisasi. */
export async function collectListeningCandidates(
    organizationId: string,
): Promise<PendingListeningItem[]> {
    const [comments, mentions, reviews, dms] = await Promise.all([
        db.query.comment.findMany({
            where: eq(schema.comment.organizationId, organizationId),
            columns: {
                id: true,
                socialAccountId: true,
                authorUsername: true,
                authorAvatar: true,
                text: true,
                createdAt: true,
            },
        }),
        db.query.mention.findMany({
            where: eq(schema.mention.organizationId, organizationId),
            columns: {
                id: true,
                socialAccountId: true,
                authorUsername: true,
                authorAvatar: true,
                text: true,
                createdAt: true,
            },
        }),
        db.query.review.findMany({
            where: eq(schema.review.organizationId, organizationId),
            columns: {
                id: true,
                socialAccountId: true,
                authorName: true,
                authorAvatar: true,
                text: true,
                rating: true,
                createdAt: true,
            },
        }),
        db.query.directMessage.findMany({
            where: eq(schema.directMessage.organizationId, organizationId),
            columns: {
                id: true,
                socialAccountId: true,
                senderUsername: true,
                senderAvatar: true,
                text: true,
                createdAt: true,
            },
        }),
    ]);

    const items: PendingListeningItem[] = [];

    for (const c of comments) {
        items.push({
            sourceType: "comment",
            sourceId: c.id,
            platform: "UNKNOWN",
            socialAccountId: c.socialAccountId,
            authorName: c.authorUsername,
            authorAvatar: c.authorAvatar,
            content: c.text ?? "",
            occurredAt: c.createdAt,
        });
    }
    for (const m of mentions) {
        items.push({
            sourceType: "mention",
            sourceId: m.id,
            platform: "UNKNOWN",
            socialAccountId: m.socialAccountId,
            authorName: m.authorUsername,
            authorAvatar: m.authorAvatar,
            content: m.text ?? "",
            occurredAt: m.createdAt,
        });
    }
    for (const r of reviews) {
        items.push({
            sourceType: "review",
            sourceId: r.id,
            platform: "UNKNOWN",
            socialAccountId: r.socialAccountId,
            authorName: r.authorName,
            authorAvatar: r.authorAvatar,
            content: r.text ?? `Rating ${r.rating}/5`,
            occurredAt: r.createdAt,
        });
    }
    for (const d of dms) {
        items.push({
            sourceType: "dm",
            sourceId: d.id,
            platform: "UNKNOWN",
            socialAccountId: d.socialAccountId,
            authorName: d.senderUsername,
            authorAvatar: d.senderAvatar,
            content: d.text ?? "",
            occurredAt: d.createdAt,
        });
    }

    // Isi platform dari social account.
    const accountIds = [...new Set(items.map((i) => i.socialAccountId).filter(Boolean) as string[])];
    if (accountIds.length > 0) {
        const accounts = await db.query.socialAccount.findMany({
            where: (t, { inArray: _in }) => _in(t.id, accountIds),
            columns: { id: true, platform: true },
        });
        const map = new Map(accounts.map((a) => [a.id, a.platform]));
        for (const item of items) {
            if (item.socialAccountId) item.platform = map.get(item.socialAccountId) ?? "UNKNOWN";
        }
    }

    return items;
}

/** Deteksi sentimen sederhana berbasis kata kunci (tanpa AI). */
export function detectSentiment(text: string): "positive" | "negative" | "question" | "neutral" {
    const lower = text.toLowerCase();
    const positive = POSITIVE_WORDS.some((w) => lower.includes(w));
    const negative = NEGATIVE_WORDS.some((w) => lower.includes(w));
    const question = QUESTION_WORDS.some((w) => lower.includes(w));
    if (negative) return "negative";
    if (positive) return "positive";
    if (question) return "question";
    return "neutral";
}

/**
 * Proses semua monitor aktif: cocokkan setiap kandidat terhadap keyword,
 * simpan hasil listening (dedup via unique index monitor+sourceType+sourceId),
 * update lastSyncedAt.
 */
export async function runListeningSync(organizationId: string): Promise<{ monitors: number; matched: number }> {
    const monitors = await db.query.socialListeningMonitor.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.isActive, true)),
        columns: { id: true, name: true, keywords: true, excludedTerms: true, platforms: true },
    });

    if (monitors.length === 0) return { monitors: 0, matched: 0 };

    const candidates = await collectListeningCandidates(organizationId);

    let matched = 0;
    const now = new Date();

    for (const monitor of monitors) {
        const keywords = (monitor.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
        const excluded = (monitor.excludedTerms ?? []).map((k) => k.toLowerCase()).filter(Boolean);
        const platforms = monitor.platforms ?? [];
        if (keywords.length === 0) continue;

        for (const item of candidates) {
            const content = item.content.toLowerCase();
            if (platforms.length > 0 && !platforms.includes(item.platform as never)) continue;
            if (excluded.some((e) => content.includes(e))) continue;

            const matchedKeywords = keywords.filter((k) => content.includes(k));
            if (matchedKeywords.length === 0) continue;

            const sentiment = detectSentiment(item.content);

            // Upsert dengan dedup alami (unique index).
            const existing = await db.query.socialListeningItem.findFirst({
                where: (t, { and: _and, eq: _eq }) =>
                    _and(
                        _eq(t.monitorId, monitor.id),
                        _eq(t.sourceType, item.sourceType),
                        _eq(t.sourceId, item.sourceId),
                    ),
                columns: { id: true },
            });

            if (existing) {
                await db.update(schema.socialListeningItem)
                    .set({
                        matchedKeywords,
                        sentiment,
                        content: item.content,
                        occurredAt: item.occurredAt,
                    })
                    .where(eq(schema.socialListeningItem.id, existing.id));
            } else {
                await db.insert(schema.socialListeningItem).values({
                    id: crypto.randomUUID(),
                    organizationId,
                    monitorId: monitor.id,
                    socialAccountId: item.socialAccountId,
                    platform: item.platform as never,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    externalUrl: item.externalUrl,
                    authorName: item.authorName,
                    authorAvatar: item.authorAvatar,
                    content: item.content,
                    mediaUrl: item.mediaUrl,
                    sentiment,
                    matchedKeywords,
                    occurredAt: item.occurredAt,
                });
            }
            matched++;
        }

        await db.update(schema.socialListeningMonitor)
            .set({ lastSyncedAt: now })
            .where(eq(schema.socialListeningMonitor.id, monitor.id));
    }

    return { monitors: monitors.length, matched };
}

/** Daftar monitor + hasilnya untuk ditampilkan di halaman. */
export async function getListeningDashboard(organizationId: string) {
    const monitors = await db.query.socialListeningMonitor.findMany({
        where: eq(schema.socialListeningMonitor.organizationId, organizationId),
        with: {
            items: {
                orderBy: [desc(schema.socialListeningItem.occurredAt)],
                limit: 50,
            },
        },
        orderBy: [desc(schema.socialListeningMonitor.createdAt)],
    });

    const unread = await db.query.socialListeningItem.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.isRead, false)),
        columns: { id: true },
    });

    // Ringkasan sentimen per monitor.
    const allItems = monitors.flatMap((m) => m.items);
    const sentiment = {
        positive: allItems.filter((i) => i.sentiment === "positive").length,
        neutral: allItems.filter((i) => i.sentiment === "neutral").length,
        negative: allItems.filter((i) => i.sentiment === "negative").length,
        question: allItems.filter((i) => i.sentiment === "question").length,
    };

    return { monitors, unreadCount: unread.length, sentiment };
}