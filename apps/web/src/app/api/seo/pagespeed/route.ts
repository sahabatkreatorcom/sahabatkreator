import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";

export async function POST(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = ctx.session.session?.activeOrganizationId;
    if (!orgId) {
        return NextResponse.json({ error: "Organisasi tidak ditemukan" }, { status: 400 });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
        return NextResponse.json({ error: "URL diperlukan" }, { status: 400 });
    }

    try {
        const result = await runPageSpeedAudit(url);
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Audit gagal" }, { status: 500 });
    }
}

async function runPageSpeedAudit(targetUrl: string): Promise<Record<string, unknown>> {
    const apiUrl = `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=PERFORMANCE&category=SEO&category=BEST_PRACTICES&category=ACCESSIBILITY`;

    let fetchResult: Response;
    try {
        fetchResult = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
    } catch {
        return {
            url: targetUrl,
            timestamp: new Date().toISOString(),
            error: true,
            message: "Gagal menghubungi Google PageSpeed API. Pastikan URL dapat diakses publik.",
        };
    }

    if (!fetchResult.ok) {
        return {
            url: targetUrl,
            timestamp: new Date().toISOString(),
            error: true,
            message: `PageSpeed API error: ${fetchResult.status}`,
        };
    }

    const data = await fetchResult.json() as Record<string, unknown>;
    const lighthouse = data?.lighthouseResult as Record<string, unknown> | undefined;
    if (!lighthouse) {
        return {
            url: targetUrl,
            timestamp: new Date().toISOString(),
            error: true,
            message: "Respons dari PageSpeed API tidak valid.",
        };
    }

    const categories = lighthouse?.categories as Record<string, { score: number }> | undefined;
    const audits = lighthouse?.audits as Record<string, { score: number; title: string; description: string; displayValue?: string; scoreDisplayMode?: string }> | undefined;

    const scores = {
        performance: Math.round((categories?.performance?.score ?? 0) * 100),
        seo: Math.round((categories?.seo?.score ?? 0) * 100),
        bestPractices: Math.round((categories?.best_practices?.score ?? 0) * 100),
        accessibility: Math.round((categories?.accessibility?.score ?? 0) * 100),
    };

    const issues: Array<Record<string, unknown>> = [];
    const metrics: Record<string, unknown> = {};

    // Process all audit items
    if (audits) {
        for (const [key, audit] of Object.entries(audits)) {
            if ((audit as Record<string, unknown>)?.scoreDisplayMode === "informative") continue;
            const auditScore = (audit as { score?: number })?.score ?? 0;
            const severity = auditScore >= 0.9 ? "info" : auditScore >= 0.5 ? "warning" : "critical";

            issues.push({
                category: getCategoryForAudit(key),
                severity,
                title: audit.title as string,
                description: audit.description as string,
                suggestion: audit.displayValue ? `${audit.displayValue} — ${getAuditSuggestion(key, audit.title as string)}` : getAuditSuggestion(key, audit.title as string),
                score: Math.round(auditScore * 100),
            });
        }
    }

    // Metrics
    const coreWebVitals = ["largestContentfulPaint", "firstInputDelay", "cumulativeLayoutShift", "totalBlockingTime"] as const;
    for (const cv of coreWebVitals) {
        const audit = audits?.[cv];
        if (audit) {
            const metricKey = cv.replace(/([A-Z])/g, "_$1").toLowerCase();
            metrics[metricKey] = audit.displayValue ?? audit.score;
        }
    }

    const totalScore = Math.round((scores.performance + scores.seo + scores.bestPractices + scores.accessibility) / 4);

    const summary = {
        total: issues.length,
        critical: issues.filter((i) => i.severity === "critical").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
        info: issues.filter((i) => i.severity === "info").length,
    };

    return {
        url: targetUrl,
        timestamp: new Date().toISOString(),
        totalScore,
        scores,
        issues,
        summary,
        metrics,
        lighthouseVersion: (lighthouse as { version?: { version?: string } })?.version?.version as string | undefined,
    };
}

function getCategoryForAudit(auditKey: string): string {
    const mapping: Record<string, string> = {
        largestContentfulPaint: "performance",
        firstInputDelay: "performance",
        cumulativeLayoutShift: "performance",
        totalBlockingTime: "performance",
        renderBlockingResources: "performance",
        usesResponsiveImages: "performance",
        offscreenImages: "performance",
        unusedJs: "performance",
        unusedCss: "performance",
        preloadFonts: "performance",
        usesOptimizedImages: "performance",
        usesWebpImages: "performance",
        usesTextCompression: "performance",
        usesRelPreconnect: "performance",
        serverResponseTime: "performance",
        timeToFirstByte: "performance",
        maxPotentialCumulativeLayoutShift: "performance",
        usesResolvedUrlRewriting: "performance",
        usesLongCacheTtl: "performance",
        domSize: "performance",
        criticalRequestChains: "performance",
        mainThreadWorkBreakdown: "performance",
        bootupTime: "performance",
        networkRequests: "performance",
        networkRTT: "performance",
        networkServerLatency: "performance",
        networkThroughput: "performance",
        finalMetrics: "performance",
        redirects: "performance",
        requestsPerUrl: "performance",
        loadSimulator: "performance",
        resourceSummary: "performance",
        deprecations: "performance",
        dnt: "best-practices",
        doesNotUsePassiveEventListeners: "best-practices",
        noDocumentWrite: "best-practices",
        noVulnerableLibraries: "best-practices",
        jsLibraries: "best-practices",
        avoidsConsoleErrors: "best-practices",
        metaDescription: "seo",
        metaViewport: "seo",
        canonical: "seo",
        robotsTxt: "seo",
        hreflang: "seo",
        favicon: "seo",
        title: "seo",
        accessKeys: "seo",
        ariaAttributes: "seo",
        metaRefresh: "seo",
        ogTitle: "seo",
        structuredData: "seo",
        viewport: "seo",
        tapTargets: "seo",
        accessibility: "accessibility",
        ariaHiddenBody: "accessibility",
        ariaInputLabel: "accessibility",
        ariaMeterNames: "accessibility",
        ariaProgressbarNames: "accessibility",
        ariaRequiredAttr: "accessibility",
        ariaValidAttr: "accessibility",
        buttonName: "accessibility",
        colorContrast: "accessibility",
        definitionList: "accessibility",
        dlItem: "accessibility",
        documentTitle: "accessibility",
        htmlHasLang: "accessibility",
        htmlLangValid: "accessibility",
        imageAlt: "accessibility",
        inputLabel: "accessibility",
        validLang: "accessibility",
        label: "accessibility",
        linkName: "accessibility",
        list: "accessibility",
        listitem: "accessibility",
        tabindex: "accessibility",
    };
    return mapping[auditKey] ?? "technical";
}

function getAuditSuggestion(auditKey: string, title: string): string {
    const suggestions: Record<string, string> = {
        "largestContentfulPaint": "Optimasi gambar dan gunakan lazy loading untuk konten di bawah fold.",
        "firstInputDelay": "Kurangi pekerjaan JavaScript di thread utama dan pecah task besar.",
        "cumulativeLayoutShift": "Tetapkan ukuran eksplisit untuk gambar dan elemen dinamis.",
        "totalBlockingTime": "Gunakan code splitting dan defer non-critical JavaScript.",
        "renderBlockingResources": "Inline atau defer CSS/JS yang memblokir rendering.",
        "offscreenImages": "Terapkan lazy loading pada gambar di luar viewport.",
        "unusedJs": "Hapus atau defer JavaScript yang tidak digunakan.",
        "unusedCss": "Hapus CSS yang tidak digunakan atau gunakan PurgeCSS.",
        "preloadFonts": "Gunakan rel='preload' untuk font kritis.",
        "usesOptimizedImages": "Kompres dan konversi gambar ke WebP/AVIF.",
        "serverResponseTime": "Optimasi server dan gunakan CDN.",
        "deprecations": "Hapus API dan fitur yang sudah di-deprecated.",
        "noVulnerableLibraries": "Update semua library JavaScript ke versi terbaru.",
        "metaDescription": "Tambahkan meta description unik (150-160 karakter).",
        "canonical": "Tambahkan canonical tag untuk menghindari duplikat konten.",
        "robotsTxt": "Pastikan robots.txt tidak memblokir resource penting.",
        "tapTargets": "Perbesar target sentuh minimal 48x48px untuk mobile.",
        "colorContrast": "Tingkatkan kontras teks dan latar belakang (rasio minimal 4.5:1).",
        "imageAlt": "Tambahkan alt text deskriptif pada setiap gambar.",
        "ariaHiddenBody": "Pastikan konten yang tersembunyi tidak menghalangi aksesibilitas.",
    };
    return suggestions[auditKey] ?? "Periksa dan optimasi elemen ini.";
}
