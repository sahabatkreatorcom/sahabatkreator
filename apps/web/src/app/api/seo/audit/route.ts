import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";

export async function POST(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
        return NextResponse.json({ error: "URL diperlukan" }, { status: 400 });
    }

    const orgId = ctx.session.session?.activeOrganizationId;
    if (!orgId) {
        return NextResponse.json({ error: "Organisasi tidak ditemukan" }, { status: 400 });
    }

    try {
        const result = await runAudit(url);
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Audit gagal" }, { status: 500 });
    }
}

async function runAudit(targetUrl: string): Promise<Record<string, unknown>> {
    let html: string;
    let loadTimeMs = 0;
    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        loadTimeMs = Date.now() - startTime;
    } catch (e) {
        return {
            url: targetUrl,
            timestamp: new Date().toISOString(),
            totalScore: 0,
            issues: [{
                category: "technical",
                severity: "critical",
                title: "Tidak dapat mengakses halaman",
                description: e instanceof Error ? e.message : "Gagal memuat URL",
                suggestion: "Pastikan URL benar dan dapat diakses publik.",
                score: 0,
            }],
            summary: { total: 1, critical: 1, warnings: 0, info: 0 },
            metrics: { titleLength: 0, metaDescriptionLength: 0, hasH1: false, wordCount: 0, images: 0, imagesWithAlt: 0, links: 0, internalLinks: 0, externalLinks: 0, loadTimeMs: 0 },
        };
    }

    const issues: Array<Record<string, unknown>> = [];
    const metrics: Record<string, unknown> = {};

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "";
    metrics.titleLength = title.length;
    if (title.length === 0) {
        issues.push({ category: "meta", severity: "critical", title: "Tidak ada title tag", description: "Halaman tidak memiliki tag title.", suggestion: "Tambahkan tag title yang deskriptif (50-60 karakter).", score: 0 });
    } else if (title.length < 30) {
        issues.push({ category: "meta", severity: "warning", title: "Title terlalu pendek", description: `Title hanya ${title.length} karakter.`, suggestion: "Perpanjang title menjadi 30-60 karakter.", score: 50 });
    } else if (title.length > 60) {
        issues.push({ category: "meta", severity: "warning", title: "Title terlalu panjang", description: `Title ${title.length} karakter, akan terpotong di hasil pencarian.`, suggestion: "Pendekkan title menjadi maksimal 60 karakter.", score: 60 });
    } else {
        issues.push({ category: "meta", severity: "info", title: "Title OK", description: `Title (${title.length} karakter) sudah dalam rentang optimal.`, suggestion: "", score: 100 });
    }

    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    const desc = descMatch?.[1] || "";
    metrics.metaDescriptionLength = desc.length;
    if (desc.length === 0) {
        issues.push({ category: "meta", severity: "critical", title: "Tidak ada meta description", description: "Halaman tidak memiliki meta description.", suggestion: "Tambahkan meta description yang menarik (150-160 karakter).", score: 0 });
    } else if (desc.length < 70) {
        issues.push({ category: "meta", severity: "warning", title: "Meta description terlalu pendek", description: `Meta description hanya ${desc.length} karakter.`, suggestion: "Perpanjang menjadi 70-160 karakter.", score: 50 });
    } else if (desc.length > 160) {
        issues.push({ category: "meta", severity: "warning", title: "Meta description terlalu panjang", description: `Meta description ${desc.length} karakter.`, suggestion: "Pendekkan menjadi maksimal 160 karakter.", score: 60 });
    } else {
        issues.push({ category: "meta", severity: "info", title: "Meta description OK", description: "Meta description sudah optimal.", suggestion: "", score: 100 });
    }

    // H1 check
    const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
    metrics.hasH1 = h1Matches.length > 0;
    if (h1Matches.length === 0) {
        issues.push({ category: "content", severity: "critical", title: "Tidak ada heading H1", description: "Halaman tidak memiliki heading H1.", suggestion: "Tambahkan tepat satu H1 yang mendeskripsikan konten utama.", score: 0 });
    } else if (h1Matches.length > 1) {
        issues.push({ category: "content", severity: "warning", title: "Terlalu banyak H1", description: `Ditemukan ${h1Matches.length} heading H1.`, suggestion: "Gunakan tepat satu H1 per halaman.", score: 60 });
    } else {
        issues.push({ category: "content", severity: "info", title: "H1 OK", description: "Ada satu heading H1.", score: 100 });
    }

    // Word count
    const text = html.replace(/<script[^>]*>[\s\S]*<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const words = text.split(/\s+/).filter(Boolean);
    metrics.wordCount = words.length;
    if (words.length < 100) {
        issues.push({ category: "content", severity: "warning", title: "Konten terlalu sedikit", description: `Hanya ${words.length} kata.`, suggestion: "Tambahkan minimal 300 kata konten berkualitas.", score: 40 });
    } else if (words.length < 300) {
        issues.push({ category: "content", severity: "info", title: "Konten cukup", description: `${words.length} kata.`, suggestion: "Pertahankan, bisa ditambah untuk SEO lebih baik.", score: 70 });
    } else {
        issues.push({ category: "content", severity: "info", title: "Konten bagus", description: `${words.length} kata.`, score: 100 });
    }

    // Images analysis
    const imgMatches = html.match(/<img[^>]*>/gi) || [];
    const imagesWithAlt = imgMatches.filter((img) => /alt=["'][^"']+["']/i.test(img)).length;
    metrics.images = imgMatches.length;
    metrics.imagesWithAlt = imagesWithAlt;
    if (imgMatches.length > 0 && imagesWithAlt < imgMatches.length) {
        const missing = imgMatches.length - imagesWithAlt;
        issues.push({ category: "accessibility", severity: "warning", title: `Gambar tanpa alt (${missing})`, description: `${missing} dari ${imgMatches.length} gambar tidak memiliki alt text.`, suggestion: "Tambahkan alt text deskriptif pada setiap gambar.", score: 60 });
    } else if (imgMatches.length === 0) {
        issues.push({ category: "accessibility", severity: "info", title: "Tidak ada gambar", description: "Halaman tidak memiliki gambar.", score: 50 });
    } else {
        issues.push({ category: "accessibility", severity: "info", title: "Gambar OK", description: "Semua gambar memiliki alt text.", score: 100 });
    }

    // Links analysis
    const linkMatches = html.match(/<a\s+href=["'][^"']+["'][^>]*>/gi) || [];
    const internalLinks = linkMatches.filter((a) => {
        const href = a.match(/href=["']([^"']+)["']/i)?.[1] || "";
        return href && !href.startsWith("http") && !href.startsWith("//");
    }).length;
    const externalLinks = linkMatches.length - internalLinks;
    metrics.links = linkMatches.length;
    metrics.internalLinks = internalLinks;
    metrics.externalLinks = externalLinks;

    // Load time
    metrics.loadTimeMs = loadTimeMs;
    if (loadTimeMs > 3000) {
        issues.push({ category: "performance", severity: "critical", title: "Halaman lambat dimuat", description: `Waktu muat: ${loadTimeMs}ms`, suggestion: "Optimasi gambar, gunakan CDN, dan minimalkan JS/CSS.", score: 20 });
    } else if (loadTimeMs > 1500) {
        issues.push({ category: "performance", severity: "warning", title: "Halaman agak lambat", description: `Waktu muat: ${loadTimeMs}ms`, suggestion: "Sedikit optimasi bisa meningkatkan performa.", score: 60 });
    } else {
        issues.push({ category: "performance", severity: "info", title: "Performa baik", description: `Waktu muat: ${loadTimeMs}ms`, score: 100 });
    }

    // Mobile viewport
    const hasViewport = /<meta\s+name=["']viewport["']\s+content=["'][^"']+["']\s*\/?>/i.test(html);
    if (!hasViewport) {
        issues.push({ category: "mobile", severity: "critical", title: "Tidak ada viewport meta", description: "Halaman tidak memiliki viewport meta tag.", suggestion: "Tambahkan <meta name='viewport' content='width=device-width, initial-scale=1'>.", score: 0 });
    } else {
        issues.push({ category: "mobile", severity: "info", title: "Viewport OK", description: "Viewport meta tag ditemukan.", score: 100 });
    }

    // Canonical
    const hasCanonical = /<link\s+rel=["']canonical["']\s+href=["'][^"']+["']\s*\/?>/i.test(html);
    if (!hasCanonical) {
        issues.push({ category: "technical", severity: "info", title: "Tidak ada canonical tag", description: "Pertimbangkan menambahkan canonical tag untuk menghindari duplikat konten.", suggestion: "Tambahkan <link rel='canonical' href='URL'>.", score: 80 });
    } else {
        issues.push({ category: "technical", severity: "info", title: "Canonical tag ada", score: 100 });
    }

    // Calculate total score
    const scoreableIssues = issues.filter((i) => i.score !== undefined);
    const totalScore = scoreableIssues.length > 0
        ? Math.round(scoreableIssues.reduce((sum, i) => sum + (i.score as number), 0) / scoreableIssues.length)
        : 50;

    const summary = {
        total: issues.length,
        critical: issues.filter((i) => i.severity === "critical").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
        info: issues.filter((i) => i.severity === "info").length,
    };

    return { url: targetUrl, timestamp: new Date().toISOString(), totalScore, issues, summary, metrics };
}
