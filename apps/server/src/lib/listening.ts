// Social Listening — monitor keyword terhadap data engagement tersinkron + web crawler.
// Sumber internal: engagement_item 90 hari terakhir (komentar, mention, review, DM).
// Sumber eksternal: listening_source (blog/kompetitor) — fetch RSS/halaman publik.
// Sentiment: lexicon Bahasa Indonesia sederhana (tanpa AI — cepat & tanpa biaya).

import { db } from "@sahabatkreator/db";
import {
  engagementItem,
  listeningItem,
  listeningMonitor,
  listeningSource,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

/** Lexicon sentiment Indonesia — kata → bobot */
const POSITIVE_WORDS = new Set([
  "bagus",
  "baguss",
  "mantap",
  "mantull",
  "keren",
  "recommended",
  "rekomendasi",
  "suka",
  "love",
  "best",
  "juara",
  "jos",
  "gokil",
  "kereeen",
  "mantaff",
  "senang",
  "puas",
  "berkualitas",
  "murah",
  "enak",
  "cepat",
  "ramah",
  "mantab",
  "top",
  "oke",
  "ok",
  "thanks",
  "makasih",
  "terima kasih",
  "thank you",
]);
const NEGATIVE_WORDS = new Set([
  "jelek",
  "buruk",
  "kecewa",
  "mahal",
  "lambat",
  "lama",
  "zonk",
  "penipuan",
  "tipu",
  "scam",
  "fake",
  "palsu",
  "rusak",
  "error",
  "gagal",
  "belum",
  "mengecewakan",
  "parah",
  "busuk",
  "hambar",
  "kotor",
  "bau",
  "payah",
  "capek",
  "ribet",
  "sulit",
  "gak bisa",
  "ga bisa",
  "tidak bisa",
]);

/** Deteksi sentiment dari teks: positive / neutral / negative / question */
export function detectSentiment(text: string | null): string {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const words = lower
    .split(/[^a-zA-Z0-9\s']+/)
    .flatMap((w) => w.split(/\s+/))
    .filter(Boolean);
  let positive = 0;
  let negative = 0;
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positive++;
    if (NEGATIVE_WORDS.has(word)) negative++;
  }
  // frasa dua kata (mis. "gak bisa")
  if (lower.includes("gak bisa") || lower.includes("ga bisa") || lower.includes("tidak bisa"))
    negative++;
  if (lower.includes("terima kasih") || lower.includes("thank you")) positive++;
  if (lower.includes("?")) {
    // pertanyaan diutamakan sebagai kategori sendiri bila tidak dominan negatif
    if (negative > positive) return "negative";
    return "question";
  }
  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}

/** Cek keyword match — return keyword yang cocok */
export function matchKeywords(content: string, keywords: string[], excluded: string[]): string[] {
  const lower = content.toLowerCase();
  // excluded term menandai item tidak relevan
  for (const term of excluded) {
    if (term && lower.includes(term.toLowerCase())) return [];
  }
  const matched: string[] = [];
  for (const kw of keywords) {
    if (kw && lower.includes(kw.toLowerCase())) matched.push(kw);
  }
  return matched;
}

/** Item kandidat hasil pencocokan (internal / web) */
type CandidateItem = {
  sourceType: string;
  platform: string;
  sourceId: string;
  externalUrl: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  content: string | null;
  mediaUrl: string | null;
  occurredAt: Date;
};

/** Hasil satu siklus sync monitor */
export type MonitorSyncResult = {
  monitorId: string;
  newItems: number;
  error?: string;
};

/**
 * Sync satu monitor: scan engagement internal 90 hari + crawl sumber web aktif.
 * Upsert ke listening_item dengan dedupe (monitorId, sourceId).
 */
export async function syncMonitor(monitorId: string): Promise<MonitorSyncResult> {
  const [monitor] = await db
    .select()
    .from(listeningMonitor)
    .where(eq(listeningMonitor.id, monitorId))
    .limit(1);
  if (!monitor) return { monitorId, newItems: 0, error: "monitor tidak ditemukan" };
  if (!monitor.isActive || monitor.keywords.length === 0) {
    return { monitorId, newItems: 0 };
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const candidates: CandidateItem[] = [];

  // --- Sumber internal: engagement items 90 hari ---
  const rows = await db
    .select({
      type: engagementItem.type,
      platform: socialAccount.platform,
      platformItemId: engagementItem.platformItemId,
      content: engagementItem.content,
      authorName: engagementItem.authorName,
      authorUsername: engagementItem.authorUsername,
      authorAvatarUrl: engagementItem.authorAvatarUrl,
      mediaUrl: engagementItem.mediaUrl,
      occurredAt: engagementItem.occurredAt,
    })
    .from(engagementItem)
    .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
    .where(
      and(
        eq(engagementItem.organizationId, monitor.organizationId),
        gte(engagementItem.occurredAt, since),
      ),
    )
    .orderBy(desc(engagementItem.occurredAt))
    .limit(1500);

  for (const row of rows) {
    // filter platform bila monitor membatasi
    if (monitor.platforms.length > 0 && !monitor.platforms.includes(row.platform)) continue;
    if (!row.content) continue;
    if (!row.platformItemId) continue;
    candidates.push({
      sourceType: row.type,
      platform: row.platform,
      sourceId: row.platformItemId,
      externalUrl: row.mediaUrl,
      authorName: row.authorName ?? row.authorUsername ?? null,
      authorAvatarUrl: row.authorAvatarUrl,
      content: row.content,
      mediaUrl: row.mediaUrl,
      occurredAt: row.occurredAt,
    });
  }

  // --- Sumber web: crawl sumber aktif milik org ---
  const webCandidates = await crawlSourcesForMonitor(
    monitor.organizationId,
    monitor.keywords,
    monitor.excludedTerms,
  );
  candidates.push(...webCandidates);

  // --- Filter keyword & upsert ---
  const itemsToInsert = candidates
    .map((cand) => {
      const content = cand.content ?? "";
      const matched = matchKeywords(content, monitor.keywords, monitor.excludedTerms);
      if (matched.length === 0) return null;
      return {
        cand,
        matched,
        sentiment: detectSentiment(content),
      };
    })
    .filter((x): x is { cand: CandidateItem; matched: string[]; sentiment: string } => x !== null)
    .slice(0, 75); // cap hasil per sync

  if (itemsToInsert.length === 0) {
    await db
      .update(listeningMonitor)
      .set({ lastSyncedAt: new Date() })
      .where(eq(listeningMonitor.id, monitor.id));
    return { monitorId, newItems: 0 };
  }

  // dedupe vs yang sudah ada
  const existing = await db
    .select({ sourceId: listeningItem.sourceId })
    .from(listeningItem)
    .where(
      and(
        eq(listeningItem.monitorId, monitor.id),
        inArray(
          listeningItem.sourceId,
          itemsToInsert.map((i) => i.cand.sourceId),
        ),
      ),
    );
  const existingIds = new Set(existing.map((e) => e.sourceId));

  const fresh = itemsToInsert.filter((i) => !existingIds.has(i.cand.sourceId));
  if (fresh.length > 0) {
    await db.insert(listeningItem).values(
      fresh.map((item) => ({
        id: `sk_lsn_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        organizationId: monitor.organizationId,
        monitorId: monitor.id,
        sourceType: item.cand.sourceType,
        platform: item.cand.platform,
        sourceId: item.cand.sourceId,
        externalUrl: item.cand.externalUrl,
        authorName: item.cand.authorName,
        authorAvatarUrl: item.cand.authorAvatarUrl,
        content: item.cand.content,
        mediaUrl: item.cand.mediaUrl,
        sentiment: item.sentiment,
        matchedKeywords: item.matched,
        isRead: false,
        occurredAt: item.cand.occurredAt,
      })),
    );
  }

  await db
    .update(listeningMonitor)
    .set({ lastSyncedAt: new Date() })
    .where(eq(listeningMonitor.id, monitor.id));

  return { monitorId, newItems: fresh.length };
}

/**
 * Sync semua monitor aktif milik org (dipanggil worker berkala / manual dari UI).
 */
export async function syncAllMonitors(organizationId: string): Promise<MonitorSyncResult[]> {
  const monitors = await db
    .select({ id: listeningMonitor.id })
    .from(listeningMonitor)
    .where(
      and(eq(listeningMonitor.organizationId, organizationId), eq(listeningMonitor.isActive, true)),
    );
  const results: MonitorSyncResult[] = [];
  for (const m of monitors) {
    results.push(await syncMonitor(m.id));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Web crawler — sumber web publik (RSS / halaman) milik org
// ---------------------------------------------------------------------------

/** proteksi SSRF: blokir IP privat & non-http(s) */
function isSafeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    )
      return false;
    // IPv4 privat
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split(".").map(Number);
      if (parts[0] === 10 || parts[0] === 127) return false;
      if (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 169 && parts[1] === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

type FetchedPage = { url: string; title: string; content: string; publishedAt: Date };

/** Strip tag HTML → teks */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse RSS/Atom sederhana → daftar item */
function parseRss(xml: string, baseUrl: string): FetchedPage[] {
  const pages: FetchedPage[] = [];
  const itemBlocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of itemBlocks.slice(0, 20)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const link =
      block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ??
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
      "";
    const description =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ??
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
      block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ??
      "";
    const dateStr =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ??
      "";
    const publishedAt =
      dateStr && !Number.isNaN(Date.parse(dateStr)) ? new Date(dateStr) : new Date();
    const url = link.startsWith("http") ? link : link ? new URL(link, baseUrl).toString() : baseUrl;
    const content = `${htmlToText(title)} ${htmlToText(description)}`;
    if (content.trim().length > 10) {
      pages.push({ url, title: htmlToText(title), content, publishedAt });
    }
  }
  return pages;
}

/** Fetch dengan timeout + max ukuran (anti memory blow) */
async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SahabatKreatorBot/1.0 (+listening)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    // max 1.5 MB — potong stream lebih aman, tapi teks sederhana cukup content-length check
    const text = await res.text();
    return text.length > 1_500_000 ? text.slice(0, 1_500_000) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Crawl satu sumber → halaman kandidat */
async function crawlSource(source: {
  id: string;
  url: string;
  sourceType: string;
}): Promise<FetchedPage[]> {
  if (!isSafeUrl(source.url)) return [];

  // Coba RSS dulu (auto): /feed, /rss, /rss.xml, /atom.xml, atau URL itu sendiri
  const candidates: string[] = [];
  if (source.sourceType === "rss") {
    candidates.push(source.url);
  } else if (source.sourceType === "auto") {
    const base = source.url.replace(/\/$/, "");
    candidates.push(
      source.url,
      `${base}/feed`,
      `${base}/rss`,
      `${base}/rss.xml`,
      `${base}/atom.xml`,
      `${base}/feed.xml`,
    );
  } else {
    candidates.push(source.url);
  }

  for (const url of candidates) {
    const text = await fetchText(url);
    if (!text) continue;
    if (/<(rss|feed)[\s>]/i.test(text) || /<(item|entry)[\s>]/i.test(text)) {
      return parseRss(text, url);
    }
  }

  // Fallback: halaman biasa → ambil teks body
  const html = await fetchText(source.url);
  if (!html) return [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? source.url;
  const body = htmlToText(html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html);
  if (body.length < 50) return [];
  return [
    {
      url: source.url,
      title: htmlToText(title),
      content: body.slice(0, 5000),
      publishedAt: new Date(),
    },
  ];
}

/** Crawl semua sumber aktif org → kandidat yang match keyword monitor */
async function crawlSourcesForMonitor(
  organizationId: string,
  keywords: string[],
  excludedTerms: string[],
): Promise<CandidateItem[]> {
  const sources = await db
    .select()
    .from(listeningSource)
    .where(
      and(eq(listeningSource.organizationId, organizationId), eq(listeningSource.isActive, true)),
    )
    .limit(15);

  const results: CandidateItem[] = [];
  for (const source of sources) {
    let pages: FetchedPage[] = [];
    let error: string | null = null;
    try {
      pages = await crawlSource(source);
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    }
    // update status crawl (best-effort)
    await db
      .update(listeningSource)
      .set({
        lastCrawledAt: new Date(),
        lastPageCount: pages.length,
        lastError: error,
      })
      .where(eq(listeningSource.id, source.id));

    for (const page of pages) {
      const matched = matchKeywords(page.content, keywords, excludedTerms);
      if (matched.length === 0) continue;
      results.push({
        sourceType: "web",
        platform: "web",
        sourceId: page.url,
        externalUrl: page.url,
        authorName: source.name,
        authorAvatarUrl: null,
        content: page.content.slice(0, 1000),
        mediaUrl: null,
        occurredAt: page.publishedAt,
      });
    }
  }
  return results;
}

/** Ringkasan listening org: jumlah monitor aktif, hasil, unread, distribusi sentiment */
export async function getListeningSummary(organizationId: string) {
  const [monitors] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listeningMonitor)
    .where(
      and(eq(listeningMonitor.organizationId, organizationId), eq(listeningMonitor.isActive, true)),
    );

  const items = await db
    .select({ sentiment: listeningItem.sentiment, isRead: listeningItem.isRead })
    .from(listeningItem)
    .where(eq(listeningItem.organizationId, organizationId))
    .orderBy(desc(listeningItem.occurredAt))
    .limit(75);

  const sentiment: Record<string, number> = { positive: 0, neutral: 0, negative: 0, question: 0 };
  let unread = 0;
  for (const item of items) {
    sentiment[item.sentiment] = (sentiment[item.sentiment] ?? 0) + 1;
    if (!item.isRead) unread++;
  }

  return {
    activeMonitors: monitors?.count ?? 0,
    totalItems: items.length,
    unread,
    sentiment,
  };
}
