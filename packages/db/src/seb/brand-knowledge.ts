// SEB — brand knowledge: scan website (crawler aman SSRF) + approval insights.
import { eq } from "drizzle-orm";
import { generateId } from "../id";
import { db } from "../index";
import { sebBrandKnowledge } from "../schema";
import { callSebModel, getSebSettings, safeJsonParse } from "./settings";

// ---------- URL helpers + SSRF protection ----------

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host.startsWith("127.") || host === "::1" || host === "[::1]")
    return true;

  const parts = host.split(".").map((part) => Number(part));
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [a = -1, b = -1] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }

  return false;
}

export function normalizeWebsiteUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL website wajib diisi");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("URL website harus memakai http atau https");
  if (url.username || url.password)
    throw new Error("URL website tidak boleh menyertakan kredensial");
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
  return match?.[1] ? stripHtml(match[1]).slice(0, 140) : null;
}

function discoverInternalLinks(html: string, baseUrl: URL) {
  const links = new Map<string, number>();
  const priorityWords = [
    "about",
    "services",
    "products",
    "shop",
    "menu",
    "pricing",
    "contact",
    "story",
    "brand",
  ];
  const regex = /href=["']([^"'#]+)["']/gi;

  for (const match of html.matchAll(regex)) {
    const href = match[1];
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.origin !== baseUrl.origin || isBlockedHostname(url.hostname)) continue;
      if (!["http:", "https:"].includes(url.protocol)) continue;
      url.hash = "";
      const normalized = url.toString();
      const path = `${url.pathname} ${url.search}`.toLowerCase();
      const score =
        priorityWords.reduce((total, word) => total + (path.includes(word) ? 2 : 0), 0) -
        path.length / 500;
      links.set(normalized, Math.max(links.get(normalized) ?? Number.NEGATIVE_INFINITY, score));
    } catch {
      // Abaikan link malformed
    }
  }

  return Array.from(links.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .filter((url) => url !== baseUrl.toString())
    .slice(0, 4);
}

type WebsitePage = { url: string; title: string | null; html: string; text: string };

async function fetchWebsitePage(url: string): Promise<WebsitePage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SebBrandCrawler/1.0 (+https://sahabatkreator.com)" },
    });
    if (!response.ok) throw new Error(`Website merespons ${response.status}`);

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

// ---------- Scan website → pending insights ----------

export type WebsiteScanResult = {
  pages: Array<{ url: string; title: string | null }>;
  pendingInsights: Record<string, unknown>;
};

/** Crawl website org (max 5 halaman) → ekstrak brand knowledge via LLM → simpan sebagai pending */
export async function scanWebsiteForSebBrandKnowledge(input: {
  organizationId: string;
  websiteUrl?: string;
}): Promise<WebsiteScanResult> {
  const settings = await getSebSettings();

  const [existing] = await db
    .select()
    .from(sebBrandKnowledge)
    .where(eq(sebBrandKnowledge.organizationId, input.organizationId))
    .limit(1);

  const target = normalizeWebsiteUrl(input.websiteUrl || existing?.websiteUrl || "");
  const homepage = await fetchWebsitePage(target.toString());
  const pages = [homepage];

  for (const link of discoverInternalLinks(homepage.html, new URL(homepage.url))) {
    if (pages.length >= 5) break;
    try {
      pages.push(await fetchWebsitePage(link));
    } catch (error) {
      console.warn(`[seb] crawl skip halaman ${link}:`, error);
    }
  }

  const sourceText = pages
    .filter((page) => page.text.length > 100)
    .map(
      (page, index) =>
        `Page ${index + 1}: ${page.title || page.url}\nURL: ${page.url}\n${page.text}`,
    )
    .join("\n\n---\n\n")
    .slice(0, 50000);

  if (!sourceText)
    throw new Error("Seb tidak menemukan teks brand yang bisa dibaca di website ini");

  const raw = await callSebModel(
    settings,
    [
      {
        role: "system",
        content:
          "You extract brand knowledge for a social media advisor. Use only supplied website text. Return strict JSON only.",
      },
      {
        role: "user",
        content: `Extract useful business and brand details from this website crawl. Return JSON with this exact shape: {"audience":"string|null","positioning":"string|null","products":"string|null","offers":"string|null","voiceRules":"string|null","bannedTopics":"string|null","learnedInsights":["string"],"crawlSummary":"string","confidence":0.0}. Do not invent details that are not supported by the source text. Keep each string concise but specific.\n\nWebsite: ${target.toString()}\n\n${sourceText}`,
      },
    ],
    { maxTokens: 1800, jsonMode: true },
  );

  const parsed = safeJsonParse<Record<string, unknown>>(raw) || {};
  const pageList = pages.map((page) => ({ url: page.url, title: page.title }));
  const crawlSummary =
    typeof parsed.crawlSummary === "string"
      ? parsed.crawlSummary
      : "Seb scanned the website and found brand context.";
  const confidence =
    typeof parsed.confidence === "number" ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5;

  const pendingInsights = {
    source: "website_crawl",
    websiteUrl: target.toString(),
    scannedAt: new Date().toISOString(),
    pages: pageList,
    audience: typeof parsed.audience === "string" ? parsed.audience : null,
    positioning: typeof parsed.positioning === "string" ? parsed.positioning : null,
    products: typeof parsed.products === "string" ? parsed.products : null,
    offers: typeof parsed.offers === "string" ? parsed.offers : null,
    voiceRules: typeof parsed.voiceRules === "string" ? parsed.voiceRules : null,
    bannedTopics: typeof parsed.bannedTopics === "string" ? parsed.bannedTopics : null,
    learnedInsights: Array.isArray(parsed.learnedInsights)
      ? parsed.learnedInsights
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12)
      : [],
    crawlSummary,
    confidence,
  };

  const values = {
    websiteUrl: target.toString(),
    pendingInsights,
    websiteScanSummary: { pages: pageList, crawlSummary, confidence },
    websiteScannedAt: new Date(),
    updatedBySebAt: new Date(),
  };

  await db
    .insert(sebBrandKnowledge)
    .values({ id: generateId("sebbk"), organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({
      target: sebBrandKnowledge.organizationId,
      set: values,
    });

  return { pages: pageList, pendingInsights };
}

/** Setujui pending insights → merge ke kolom brand knowledge utama */
export async function approveSebPendingInsights(input: {
  organizationId: string;
  /** Field hasil scan/report yang disetujui user (sudah tervalidasi route) */
  fields: {
    audience?: string | null;
    positioning?: string | null;
    products?: string | null;
    offers?: string | null;
    voiceRules?: string | null;
    bannedTopics?: string | null;
    learnedInsights?: string[];
  };
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(sebBrandKnowledge)
    .where(eq(sebBrandKnowledge.organizationId, input.organizationId))
    .limit(1);

  const mergedInsights = Array.from(
    new Set([...(existing?.learnedInsights ?? []), ...(input.fields.learnedInsights ?? [])]),
  ).slice(0, 50);

  const values = {
    audience: input.fields.audience ?? existing?.audience ?? null,
    positioning: input.fields.positioning ?? existing?.positioning ?? null,
    products: input.fields.products ?? existing?.products ?? null,
    offers: input.fields.offers ?? existing?.offers ?? null,
    voiceRules: input.fields.voiceRules ?? existing?.voiceRules ?? null,
    bannedTopics: input.fields.bannedTopics ?? existing?.bannedTopics ?? null,
    learnedInsights: mergedInsights,
    pendingInsights: null,
    updatedAt: new Date(),
  };

  await db
    .insert(sebBrandKnowledge)
    .values({ id: generateId("sebbk"), organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({
      target: sebBrandKnowledge.organizationId,
      set: values,
    });
}
