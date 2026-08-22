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

    const { input, tone, platform } = await req.json() as { input: string; tone: string; platform: string };
    if (!input || typeof input !== "string") {
        return NextResponse.json({ error: "Input diperlukan" }, { status: 400 });
    }

    try {
        const result = await analyzeCaption(input, tone || "professional", platform || "instagram");
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Analisis gagal" }, { status: 500 });
    }
}

async function analyzeCaption(text: string, tone: string, platform: string): Promise<Record<string, unknown>> {
    // Simulate AI analysis with heuristics
    const words = text.split(/\s+/);
    const wordCount = words.length;
    const charCount = text.length;

    // Engagement score factors
    let engagementScore = 50;
    if (wordCount >= 20 && wordCount <= 200) engagementScore += 15;
    if (wordCount > 200) engagementScore += 5;
    if (/\?/.test(text)) engagementScore += 5;
    if (/\*[^*]+\*/.test(text) || /_+[^_]+_+/.test(text)) engagementScore += 5;
    if (/[🎉🔥💡✨👀🚀❤️🙌📢]/.test(text)) engagementScore += 10;
    if (/\d/.test(text)) engagementScore += 3;
    if (/\n\s*\n/.test(text)) engagementScore += 5;
    if (/[A-Z]{2,}/.test(text)) engagementScore -= 5;
    engagementScore = Math.max(10, Math.min(95, engagementScore));

    // Clarity score
    let clarityScore = 50;
    if (wordCount >= 10 && wordCount <= 150) clarityScore += 20;
    if (text.includes(".") || text.includes(".")) clarityScore += 10;
    if (/^(hai| Halo| Hey| Hi| Assalam| Halo| Selamat)/i.test(text.trim())) clarityScore += 5;
    if (charCount > 500) clarityScore -= 10;
    clarityScore = Math.max(20, Math.min(95, clarityScore));

    // Emotional score
    let emotionalScore = 40;
    const emotionWords = ["senang", "bahagia", "sukses", "inspirasi", "berubah", "berhasil", "cantik", "bagus", "hebat", "mantap", "keren", "lucu", "syuk", "cinta", "marah", "sedih", "takut", "haru", "bangga"];
    const foundEmotions = emotionWords.filter((w) => text.toLowerCase().includes(w));
    emotionalScore += foundEmotions.length * 5;
    if (/[!]{2,}/.test(text)) emotionalScore += 5;
    if (/[🎉🔥💡✨👀🚀❤️🙌📢]/.test(text)) emotionalScore += 8;
    emotionalScore = Math.max(15, Math.min(95, emotionalScore));

    // SEO score
    let seoScore = 40;
    if (/\d/.test(text)) seoScore += 5;
    if (/[a-z][a-z]+\.[a-z]{2,}/.test(text)) seoScore += 5;
    if (/\?/.test(text)) seoScore += 3;
    seoScore = Math.max(20, Math.min(90, seoScore));

    // Generate improved caption
    const improvedCaption = generateImprovedCaption(text, tone, platform);

    // Generate hashtags
    const hashtags = generateHashtags(text, platform);

    // Generate hooks
    const hooks = generateHooks(text, tone);

    // Generate CTAs
    const ctas = generateCTAs(platform);

    // Generate suggestions
    const suggestions = generateSuggestions(text, { engagement: engagementScore, clarity: clarityScore, emotional: emotionalScore, seo: seoScore });

    return {
        caption: improvedCaption,
        hashtags,
        hooks,
        ctas,
        scores: {
            engagement: engagementScore,
            clarity: clarityScore,
            emotional: emotionalScore,
            seo: seoScore,
        },
        suggestions,
        characterCount: charCount,
    };
}

function generateImprovedCaption(text: string, tone: string, platform: string): string {
    const paragraphs = text.split(/\n\s*\n/);
    let improved = text;

    // Add spacing for readability
    if (paragraphs.length === 1 && text.length > 80) {
        // Break into chunks
        const sentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [];
        const chunks: string[] = [];
        let current = "";
        for (const sentence of sentences) {
            if ((current + sentence).length > 60) {
                if (current) chunks.push(current.trim());
                current = sentence.trim();
            } else {
                current += sentence;
            }
        }
        if (current) chunks.push(current.trim());
        improved = chunks.slice(0, 4).join("\n\n");
    }

    // Tone adjustments
    if (tone === "humorous") {
        if (!improved.toLowerCase().includes("wkwk") && !improved.toLowerCase().includes("ha") && !improved.toLowerCase().includes("😂")) {
            improved += "\n\n😂";
        }
    } else if (tone === "inspirational") {
        if (!improved.toLowerCase().includes("mari") && !improved.toLowerCase().includes("ayo") && !improved.toLowerCase().includes("✨")) {
            improved += "\n\n✨";
        }
    } else if (tone === "urgent") {
        if (!improved.toLowerCase().includes("cepat") && !improved.toLowerCase().includes("segera") && !improved.toLowerCase().includes("⏰")) {
            improved += "\n\n⏰";
        }
    }

    // Platform-specific formatting
    if (platform === "linkedin") {
        improved = improved.replace(/\n/g, "\n\n");
    } else if (platform === "instagram") {
        // Add line breaks for readability
        improved = improved.replace(/\n\n+/g, "\n\n");
    }

    return improved.trim();
}

function generateHashtags(text: string, platform: string): string[] {
    const general = ["#sahabatkreator", "#kreatorindonesia", "#contentcreator", "#socialmediamarketing"];
    const platformSpecific: Record<string, string[]> = {
        instagram: ["#instagramindonesia", "#instagramer", "#explore", "#viral", "#fyp"],
        tiktok: ["#tiktokindonesia", "#fyp", "#viral", "#trend", "#diketikok"],
        linkedin: ["#linkedin", "#professional", "#networking", "#businessindonesia"],
        twitter: ["#twitterindonesia", "#thread", "#viral", "#fyp"],
        facebook: ["#facebook", "#kontenindonesia", "#brandindonesia"],
        youtube: ["#youtubeindonesia", "#youtube", "#vlog", "#kontenyoutube"],
    };

    // Extract keywords from text
    const words = text.toLowerCase().split(/\s+/);
    const keywords = words.filter((w) => w.length > 4 && /^[a-z]+$/i.test(w));
    const uniqueKeywords = [...new Set(keywords)].slice(0, 5);

    const hashtags = new Set<string>();
    platformSpecific[platform]?.forEach((h) => hashtags.add(h));
    general.forEach((h) => hashtags.add(h));
    uniqueKeywords.forEach((kw) => hashtags.add(`#${kw}`));

    return Array.from(hashtags).slice(0, 15);
}

function generateHooks(text: string, tone: string): string[] {
    const hooks: string[] = [];
    const firstLine = text.split("\n")[0] || text.slice(0, 50);

    if (tone === "professional") {
        hooks.push(
            `📌 ${firstLine.replace(/[.#]/g, "").slice(0, 40)}`,
            `💡 Tahukah Anda? ${firstLine.slice(0, 40)}`,
            `🎯 Rahasia di balik ${firstLine.slice(0, 40).toLowerCase()}`
        );
    } else if (tone === "humorous") {
        hooks.push(
            `😂 Gila! ${firstLine.slice(0, 40)}`,
            `🤣 Baru kali ini baca ini...`,
            `😅 Siapa yang relate?`
        );
    } else if (tone === "inspirational") {
        hooks.push(
            `✨ Inspirasi hari ini: ${firstLine.slice(0, 40)}`,
            `🚀 Mulai perjalananmu dari sini`,
            `💪 Kamu bisa lakukan ini!`
        );
    } else {
        hooks.push(
            `📌 ${firstLine.replace(/[.#]/g, "").slice(0, 40)}`,
            `💡 ${firstLine.slice(0, 40)}`,
            `🔥 ${firstLine.slice(0, 40)}`
        );
    }

    return hooks.slice(0, 3);
}

function generateCTAs(platform: string): string[] {
    const ctas: Record<string, string[]> = {
        instagram: ["Simpan post ini! 💾", "Share ke cerita kamu! 📲", "Komen di bawah 👇", "Follow @sahabatkreator untuk tips lainnya ✨"],
        tiktok: ["Follow untuk tips lainnya! 👍", "Komen 'MAU' jika mau panduan lengkap! 💬", "Share ke teman kamu! 🔄"],
        linkedin: ["Setuju? Reaksi 👍", "Bagikan kepada jaringan Anda ↗️", "Komen pendapat Anda di bawah 👇", "Follow saya untuk konten serupa 📌"],
        twitter: ["RT kalau setuju! 🔄", "Balas dengan pendapatmu! 💬", "Follow untuk update terbaru 📌"],
        facebook: ["Share ke timeline kamu! 📤", "Komen pendapatmu! 💬", "Tag teman yang perlu baca ini! 👥"],
        youtube: ["Subscribe channel ini! 🔔", "Like dan komen di bawah! 👍", "Nyalakan lonceng notifikasi! 🔔"],
    };

    return ctas[platform] || ctas.instagram;
}

function generateSuggestions(text: string, scores: { engagement: number; clarity: number; emotional: number; seo: number }): string[] {
    const suggestions: string[] = [];

    if (scores.engagement < 60) {
        suggestions.push("Tambahkan emoji atau pertanyaan untuk meningkatkan engagement.");
    }
    if (scores.clarity < 60) {
        suggestions.push("Perbaiki struktur kalimat agar lebih mudah dipahami. Pecah paragraf panjang.");
    }
    if (scores.emotional < 60) {
        suggestions.push("Tambahkan unsur emosional: cerita pribadi, ekspresi, atau ajakan berempati.");
    }
    if (scores.seo < 60) {
        suggestions.push("Tambahkan kata kunci yang relevan di awal caption untuk SEO.");
    }
    if (text.length < 50) {
        suggestions.push("Caption terlalu pendek. Tambahkan lebih banyak konteks dan detail.");
    }
    if (text.length > 1000) {
        suggestions.push("Caption terlalu panjang. Pertimbangkan untuk memecah menjadi beberapa post atau ringkas.");
    }
    if (!text.includes("?") && scores.engagement < 70) {
        suggestions.push("Tambahkan pertanyaan di akhir caption untuk mendorong komentar.");
    }
    if (!/[🎉🔥💡✨👀🚀❤️🙌📢😂😅🤔💪⏰💡📌]/.test(text)) {
        suggestions.push("Tambahkan emoji yang relevan untuk membuat caption lebih menarik secara visual.");
    }
    if (!/\n/.test(text) && text.length > 100) {
        suggestions.push("Gunakan baris baru untuk meningkatkan keterbacaan caption Anda.");
    }

    return suggestions.slice(0, 5);
}
