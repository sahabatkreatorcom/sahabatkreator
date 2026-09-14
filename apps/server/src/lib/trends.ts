// Tren pencarian Google Indonesia — data riil publik (tanpa OAuth/API key).
//
// Endpoint dailytrends lama sudah 404 (Google memindahkan ke surface "Trending Now",
// per riset Sep 2026). Route yang masih hidup:
// 1. RSS publik: trends.google.com/trending/rss?geo=ID — paling stabil
// 2. Widget API lama: butuh NID cookie warm-up (load homepage dulu) — fallback
//
// Cache in-memory 1 jam: tren harian tidak berubah cepat, hemat rate limit.
export type TrendItem = {
  title: string;
  /** Trafik pencarian relatif Google (mis. "20K+") */
  approxTraffic: string | null;
  /** Artikel berita terkait (judul + url + sumber) */
  articles: { title: string; url: string; source: string }[];
  pictureUrl: string | null;
};

type CacheEntry = { data: TrendItem[]; fetchedAt: number };

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
let cache: CacheEntry | null = null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Decode entity XML dasar */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Ambil inner text elemen pertama: <tag>...</tag> (CDATA-aware) */
function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return decodeXml(m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "").trim());
}

/** Ambil semua elemen <item>...</item> dari RSS */
function rssItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) items.push(m[1]);
  }
  return items;
}

/** Parse RSS "Trending Now" Google → TrendItem[] */
function parseTrendingRss(xml: string): TrendItem[] {
  return rssItems(xml)
    .map((item) => {
      const title = tagText(item, "title");
      if (!title) return null;
      // ht:approx_traffic (namespace Google) — coba dua bentuk tag
      const approxTraffic = tagText(item, "ht:approx_traffic") ?? tagText(item, "approx_traffic");
      // Berita terkait: ht:news_item* (nested)
      const articles: TrendItem["articles"] = [];
      const newsRe = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/g;
      for (const nm of item.matchAll(newsRe)) {
        if (articles.length >= 3) break;
        const block = nm[1]!;
        const nTitle = tagText(block, "ht:news_item_title") ?? tagText(block, "news_item_title");
        const nUrl = tagText(block, "ht:news_item_url") ?? tagText(block, "news_item_url");
        const nSource = tagText(block, "ht:news_item_source") ?? tagText(block, "news_item_source");
        if (nTitle && nUrl) articles.push({ title: nTitle, url: nUrl, source: nSource ?? "" });
      }
      const pictureUrl = tagText(item, "ht:picture") ?? tagText(item, "picture");
      return { title, approxTraffic, articles, pictureUrl } satisfies TrendItem;
    })
    .filter((t): t is TrendItem => t !== null);
}

/**
 * Ambil tren pencarian Google Indonesia.
 * Strategi: RSS Trending Now (utama) → return kosong bila gagal (UI menampilkan
 * pesan "tren belum tersedia" tanpa error 500). Cache 1 jam.
 */
export async function fetchDailyTrendsID(limit = 20): Promise<TrendItem[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data.slice(0, limit);
  }

  try {
    // Warm-up: load homepage Trends untuk mendapat cookie NID (wajib sejak 2025,
    // tanpa ini endpoint trends merespons 429)
    const cookies: string[] = [];
    try {
      const home = await fetch("https://trends.google.com/trending?geo=ID&hl=id", {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
      });
      const setCookies =
        home.headers.getSetCookie?.() ??
        (home.headers.get("set-cookie") ? [home.headers.get("set-cookie")!] : []);
      for (const sc of setCookies) {
        const pair = sc.split(";")[0];
        if (pair && !cookies.includes(pair)) cookies.push(pair);
      }
    } catch {
      // Warm-up gagal — coba lanjut tanpa cookie
    }

    const res = await fetch("https://trends.google.com/trending/rss?geo=ID", {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "id-ID,id;q=0.9",
        ...(cookies.length > 0 ? { Cookie: cookies.join("; ") } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[trends] RSS Trending Now merespons ${res.status}`);
      return cache?.data.slice(0, limit) ?? [];
    }

    const xml = await res.text();
    if (!xml.includes("<item")) {
      console.error("[trends] RSS tidak berisi item tren");
      return cache?.data.slice(0, limit) ?? [];
    }

    const items = parseTrendingRss(xml);
    if (items.length === 0) {
      return cache?.data.slice(0, limit) ?? [];
    }

    cache = { data: items, fetchedAt: Date.now() };
    return items.slice(0, limit);
  } catch (error) {
    console.error("[trends] fetch gagal:", error);
    return cache?.data.slice(0, limit) ?? [];
  }
}
