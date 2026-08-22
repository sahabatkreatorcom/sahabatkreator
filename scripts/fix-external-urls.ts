/**
 * Script untuk memperbaiki external_url, external_id, external_thumbnail_url, dan synced_at
 * yang salah/NULL di database.
 *
 * Cara pakai:
 *   1. Dry run (preview):     npx tsx scripts/fix-external-urls.ts --dry-run
 *   2. Apply:                 npx tsx scripts/fix-external-urls.ts --apply
 */
import { db, schema } from "@sahabat-kreator/db";
import { eq, ne, isNull } from "drizzle-orm";

interface PostRow {
    id: string;
    platform: string | null;
    platformPostId: string | null;
    externalUrl: string | null;
    externalId: string | null;
    externalThumbnailUrl: string | null;
    syncedAt: Date | null;
    publishedAt: Date | null;
    socialAccountId: string | null;
    status: string;
}

interface AccountName {
    name: string | null;
}

async function fetchAccountName(socialAccountId: string | null): Promise<string | null> {
    if (!socialAccountId) return null;
    try {
        const account = await db.query.socialAccount.findFirst({
            where: eq(schema.socialAccount.id, socialAccountId),
            columns: { name: true },
        });
        return account?.name ?? null;
    } catch {
        return null;
    }
}

function buildCorrectUrl(platform: string | null, platformPostId: string | null, accountName: string | null): string | null {
    if (!platform || !platformPostId) return null;

    let cleanId = platformPostId;

    // LinkedIn URN: urn:li:share:1234567890 → ambil numeric part
    const urnMatch = platformPostId.match(/share:(\d+)/);
    if (urnMatch) cleanId = urnMatch[1];

    // TikTok ID "completed" tidak valid
    if (platform === "TIKTOK" && cleanId === "completed") return null;

    switch (platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE":
            return cleanId ? `https://instagram.com/p/${cleanId}` : null;
        case "TIKTOK":
            return cleanId ? `https://www.tiktok.com/@${accountName ?? "user"}/video/${cleanId}` : null;
        case "FACEBOOK":
            return cleanId ? `https://facebook.com/${cleanId}` : null;
        case "YOUTUBE":
            return cleanId ? `https://youtube.com/watch?v=${cleanId}` : null;
        case "PINTEREST":
            return cleanId ? `https://pinterest.com/pin/${cleanId}` : null;
        case "LINKEDIN":
            return cleanId ? `https://www.linkedin.com/feed/update/urn:li:share:${cleanId}` : null;
        case "THREADS":
            return cleanId ? `https://threads.net/@${accountName ?? "user"}/post/${cleanId}` : null;
        default:
            return null;
    }
}

function buildExternalId(platform: string | null, platformPostId: string | null, externalUrl: string | null): string | null {
    if (platformPostId) return platformPostId;
    // Ekstrak dari URL jika ada
    if (externalUrl) {
        const match = externalUrl.match(/\/([a-zA-Z0-9_-]+)$/);
        if (match) return match[1];
    }
    return null;
}

function buildThumbnailUrl(platform: string | null, platformPostId: string | null, accountName: string | null): string | null {
    if (!platform || !platformPostId) return null;

    // YouTube thumbnail
    if (platform === "YOUTUBE") {
        return `https://img.youtube.com/vi/${platformPostId}/maxresdefault.jpg`;
    }

    // TikTok, LinkedIn, Instagram, Facebook, Pinterest, Threads — tidak bisa di-generate tanpa API
    // atau user harus upload manual
    return null;
}

async function fixPosts(dryRun: boolean): Promise<void> {
    console.log(`🔧 Starting external URL fix... ${dryRun ? "(DRY RUN - no save)" : "(APPLY MODE)"}\n`);

    const posts = await db.select({
        id: schema.post.id,
        platform: schema.post.platform,
        platformPostId: schema.post.platformPostId,
        externalUrl: schema.post.externalUrl,
        externalId: schema.post.externalId,
        externalThumbnailUrl: schema.post.externalThumbnailUrl,
        syncedAt: schema.post.syncedAt,
        publishedAt: schema.post.publishedAt,
        socialAccountId: schema.post.socialAccountId,
        status: schema.post.status,
    })
    .from(schema.post)
    .where(ne(schema.post.platformPostId, null));

    if (posts.length === 0) {
        console.log("No posts with platformPostId found.");
        return;
    }

    console.log(`Found ${posts.length} posts to process.\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    const changes: Array<{ postId: string; field: string; old: string | null; new: string | null }> = [];

    for (const post of posts) {
        try {
            const accountName = await fetchAccountName(post.socialAccountId);
            const correctUrl = buildCorrectUrl(post.platform, post.platformPostId, accountName);
            const correctId = buildExternalId(post.platform, post.platformPostId, post.externalUrl);
            const correctThumb = buildThumbnailUrl(post.platform, post.platformPostId, accountName);

            let needsUpdate = false;
            const updates: Record<string, unknown> = {};

            // Fix external_url
            if (correctUrl && post.externalUrl !== correctUrl) {
                console.log(`  [URL]  ${post.id}: "${post.externalUrl}" → "${correctUrl}"`);
                updates.externalUrl = correctUrl;
                needsUpdate = true;
                changes.push({ postId: post.id, field: "externalUrl", old: post.externalUrl, new: correctUrl });
            }

            // Fix external_id
            if (correctId && post.externalId !== correctId) {
                console.log(`  [ID]   ${post.id}: "${post.externalId}" → "${correctId}"`);
                updates.externalId = correctId;
                needsUpdate = true;
                changes.push({ postId: post.id, field: "externalId", old: post.externalId, new: correctId });
            }

            // Fix external_thumbnail_url
            if (correctThumb && post.externalThumbnailUrl !== correctThumb) {
                console.log(`  [THMB] ${post.id}: "${post.externalThumbnailUrl}" → "${correctThumb}"`);
                updates.externalThumbnailUrl = correctThumb;
                needsUpdate = true;
                changes.push({ postId: post.id, field: "externalThumbnailUrl", old: post.externalThumbnailUrl, new: correctThumb });
            }

            // Fix synced_at
            if (!post.syncedAt && post.publishedAt) {
                console.log(`  [SYNC] ${post.id}: synced_at NULL → ${post.publishedAt.toISOString()}`);
                updates.syncedAt = post.publishedAt;
                needsUpdate = true;
                changes.push({ postId: post.id, field: "syncedAt", old: null, new: post.publishedAt.toISOString() });
            }

            if (needsUpdate) {
                updates.updatedAt = new Date();
                if (!dryRun) {
                    await db.update(schema.post)
                        .set(updates)
                        .where(eq(schema.post.id, post.id));
                }
                fixed++;
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`  ❌ [ERROR] ${post.id}: ${err instanceof Error ? err.message : String(err)}`);
            errors++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Fixed:   ${fixed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log(`   Total:   ${posts.length}`);
    console.log(`   Changes: ${changes.length}`);

    if (dryRun) {
        console.log("\n⚠️  This was a dry run. No changes were saved.");
        console.log("   Run with --apply to save changes.");
    }
}

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");

fixPosts(dryRun).catch(console.error);
