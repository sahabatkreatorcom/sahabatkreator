import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { callOpenRouter, getOpenRouterSettings, safeJsonParse } from "@/lib/ai/openrouter";

// ============================================================================
// Brand knowledge query helpers
// ============================================================================

export async function getBrandKnowledge(organizationId: string) {
    const kb = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
    });
    return kb
        ? {
              id: kb.id,
              websiteUrl: kb.websiteUrl,
              audience: kb.audience,
              positioning: kb.positioning,
              products: kb.products,
              offers: kb.offers,
              voiceRules: kb.voiceRules,
              bannedTopics: kb.bannedTopics,
              learnedInsights: kb.learnedInsights,
              pendingInsights: kb.pendingInsights,
              websiteScanSummary: kb.websiteScanSummary,
              websiteScannedAt: kb.websiteScannedAt?.toISOString() ?? null,
              updatedAt: kb.updatedAt.toISOString(),
          }
        : null;
}

export async function updateBrandKnowledge(
    organizationId: string,
    input: Partial<{
        websiteUrl: string;
        audience: string;
        positioning: string;
        products: string;
        offers: string;
        voiceRules: string;
        bannedTopics: string;
    }>,
) {
    const existing = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { id: true },
    });

    if (existing) {
        await db.update(schema.sebBrandKnowledge)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(schema.sebBrandKnowledge.id, existing.id));
        return { ok: true };
    }

    await db.insert(schema.sebBrandKnowledge).values({
        id: randomUUID(),
        organizationId,
        websiteUrl: input.websiteUrl ?? null,
        audience: input.audience ?? null,
        positioning: input.positioning ?? null,
        products: input.products ?? null,
        offers: input.offers ?? null,
        voiceRules: input.voiceRules ?? null,
        bannedTopics: input.bannedTopics ?? null,
    });
    return { ok: true };
}

// ============================================================================
// Website scan untuk brand knowledge
// ============================================================================

function isBlockedHostname(hostname: string) {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "0.0.0.0" || host.startsWith("127.") || host === "::1" || host === "[::1]") return true;

    const parts = host.split(".").map((part) => Number(part));
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
    }
    return false;
}

function isBlockedIp(ip: string): boolean {
    const v4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4Match) {
        const [a, b, c, d] = v4Match.slice(1).map(Number);
        if ([a, b, c, d].some((n) => n > 255)) return true;
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }

    const mapped = ip.toLowerCase().match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIp(mapped[1]);

    const v6 = ip.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
    if (v6.startsWith("2001:db8")) return true;
    if (v6.startsWith("64:ff9b")) return true;
    if (v6.startsWith("2002")) {
        const parts = v6.split(":");
        if (parts.length >= 3) {
            const h = parts[2].padStart(4, "0");
            return isBlockedIp(`${parseInt(h.slice(0, 2), 16)}.${parseInt(h.slice(2, 4), 16)}`);
        }
        return true;
    }
    return false;
}

async function assertPublicResolvedIp(hostname: string): Promise<void> {
    const { lookup } = await import("node:dns/promises");
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    for (const addr of addresses) {
        if (isBlockedIp(addr.address)) {
            throw new Error("URL website menunjuk ke alamat internal — tidak diizinkan");
        }
    }
}

function normalizeWebsiteUrl(input: string): URL {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("URL website wajib diisi.");

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL website harus menggunakan http atau https");
    if (url.port && ![80, 443].includes(Number(url.port))) throw new Error("URL website harus menggunakan port standar");
    if (isBlockedHostname(url.hostname)) throw new Error("URL website tidak diizinkan");
    url.hash = "";
    return url;
}

function stripHtml(html: string) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
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

function pageTitle(html: string) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 140) : null;
}

function discoverInternalLinks(html: string, baseUrl: URL) {
    const links = new Map<string, number>();
    const priorityWords = ["about", "services", "products", "shop", "menu", "pricing", "contact", "story", "brand"];
    const regex = /href=["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl);
            if (url.origin !== baseUrl.origin || isBlockedHostname(url.hostname)) continue;
            if (!["http:", "https:"].includes(url.protocol)) continue;
            url.hash = "";
            const normalized = url.toString();
            const path = `${url.pathname} ${url.search}`.toLowerCase();
            const score = priorityWords.reduce((total, word) => total + (path.includes(word) ? 2 : 0), 0) - path.length / 500;
            links.set(normalized, Math.max(links.get(normalized) ?? -Infinity, score));
        } catch {
            // Abaikan link yang tidak valid.
        }
    }

    return Array.from(links.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([url]) => url)
        .filter((url) => url !== baseUrl.toString())
        .slice(0, 4);
}

async function fetchWebsitePage(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const parsed = new URL(url);
        await assertPublicResolvedIp(parsed.hostname);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "SebBrandCrawler/1.0 (+https://sahabat-kreator.com)" },
        });
        if (!response.ok) throw new Error(`Website mengembalikan status ${response.status}`);

        const finalUrl = normalizeWebsiteUrl(response.url || url).toString();
        const contentType = response.headers.get("content-type") || "";
        if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
            throw new Error("Website tidak mengembalikan teks/HTML yang bisa dibaca");
        }

        const html = (await response.text()).slice(0, 500_000);
        return { url: finalUrl, title: pageTitle(html), html, text: stripHtml(html).slice(0, 12000) };
    } finally {
        clearTimeout(timeout);
    }
}

export interface PendingInsights {
    source: string;
    websiteUrl: string;
    scannedAt: string;
    pages: Array<{ url: string; title: string | null }>;
    audience: string | null;
    positioning: string | null;
    products: string | null;
    offers: string | null;
    voiceRules: string | null;
    bannedTopics: string | null;
    learnedInsights: string[];
    crawlSummary: string;
    confidence: number;
}

/**
 * Scan website org → ekstrak brand knowledge via AI → simpan ke pendingInsights
 * (belum di-approve; user bisa menyalin ke field brand knowledge di halaman Seb).
 */
export async function scanWebsiteForBrandKnowledge({
    organizationId,
    websiteUrl,
}: {
    organizationId: string;
    websiteUrl?: string;
}) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error("OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.");
    }

    const existing = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { websiteUrl: true },
    });

    const target = normalizeWebsiteUrl(websiteUrl || existing?.websiteUrl || "");
    const homepage = await fetchWebsitePage(target.toString());
    const pages: Array<{ url: string; title: string | null; html: string; text: string }> = [homepage];

    for (const link of discoverInternalLinks(homepage.html, new URL(homepage.url))) {
        if (pages.length >= 5) break;
        try {
            pages.push(await fetchWebsitePage(link));
        } catch {
            // Lewati halaman yang gagal di-crawl.
        }
    }

    const sourceText = pages
        .filter((page) => page.text.length > 100)
        .map((page, index) => `Halaman ${index + 1}: ${page.title || page.url}\nURL: ${page.url}\n${page.text}`)
        .join("\n\n---\n\n")
        .slice(0, 50000);

    if (!sourceText) throw new Error("Seb tidak menemukan teks brand yang bisa dibaca di website ini.");

    const raw = await callOpenRouter(
        settings,
        [
            { role: "system", content: "You extract brand knowledge for a social media advisor. Use only supplied website text. Return strict JSON only." },
            {
                role: "user",
                content: `Ekstrak detail bisnis dan brand dari hasil crawl website ini. Kembalikan JSON dengan bentuk persis ini: {"audience":"string|null","positioning":"string|null","products":"string|null","offers":"string|null","voiceRules":"string|null","bannedTopics":"string|null","learnedInsights":["string"],"crawlSummary":"string","confidence":0.0}. Jangan mengarang detail yang tidak didukung teks sumber. Jaga tiap string ringkas tapi spesifik.\n\nWebsite: ${target.toString()}\n\n${sourceText}`,
            },
        ],
        1800,
        true,
    );

    const parsed = safeJsonParse<Record<string, unknown>>(raw) || {};
    const pendingInsights: PendingInsights = {
        source: "website_crawl",
        websiteUrl: target.toString(),
        scannedAt: new Date().toISOString(),
        pages: pages.map((page) => ({ url: page.url, title: page.title })),
        audience: typeof parsed.audience === "string" ? parsed.audience : null,
        positioning: typeof parsed.positioning === "string" ? parsed.positioning : null,
        products: typeof parsed.products === "string" ? parsed.products : null,
        offers: typeof parsed.offers === "string" ? parsed.offers : null,
        voiceRules: typeof parsed.voiceRules === "string" ? parsed.voiceRules : null,
        bannedTopics: typeof parsed.bannedTopics === "string" ? parsed.bannedTopics : null,
        learnedInsights: Array.isArray(parsed.learnedInsights)
            ? parsed.learnedInsights.filter((item) => typeof item === "string").slice(0, 12)
            : [],
        crawlSummary: typeof parsed.crawlSummary === "string" ? parsed.crawlSummary : "Seb memindai website dan menemukan konteks brand.",
        confidence: typeof parsed.confidence === "number" ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
    };

    const knowledge = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { id: true },
    });
    if (knowledge) {
        await db.update(schema.sebBrandKnowledge)
            .set({
                websiteUrl: target.toString(),
                pendingInsights,
                websiteScanSummary: {
                    pages: pendingInsights.pages,
                    crawlSummary: pendingInsights.crawlSummary,
                    confidence: pendingInsights.confidence,
                },
                websiteScannedAt: new Date(),
                updatedBySebAt: new Date(),
            })
            .where(eq(schema.sebBrandKnowledge.id, knowledge.id));
    } else {
        await db.insert(schema.sebBrandKnowledge).values({
            id: randomUUID(),
            organizationId,
            websiteUrl: target.toString(),
            pendingInsights,
            websiteScanSummary: {
                pages: pendingInsights.pages,
                crawlSummary: pendingInsights.crawlSummary,
                confidence: pendingInsights.confidence,
            },
            websiteScannedAt: new Date(),
            updatedBySebAt: new Date(),
        });
    }

    return { pages: pendingInsights.pages, pendingInsights };
}

export function normalizeSebTimezone(timezone?: string | null): string {
    if (!timezone) return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
        return timezone;
    } catch {
        return "UTC";
    }
}
