import { randomUUID } from "node:crypto";
import { and, desc, eq, like } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

export type ActivityAction =
    | "post.created"
    | "post.updated"
    | "post.scheduled"
    | "post.published"
    | "post.failed"
    | "post.deleted"
    | "media.uploaded"
    | "media.deleted"
    | "account.connected"
    | "account.disconnected"
    | "account.refreshed"
    | "team.invited"
    | "team.removed"
    | "team.role_changed"
    | "settings.updated"
    | "organization.created"
    | "automation.created"
    | "automation.updated"
    | "automation.deleted"
    | "automation.triggered"
    | "comment.replied"
    | "competitor.created"
    | "competitor.deleted"
    | "seb.report_generated"
    | "seb.recommendation_updated"
    | "seb.media_analyzed"
    | "listening.created"
    | "listening.deleted"
    | "listening.synced";

export const ACTION_LABELS: Record<ActivityAction, string> = {
    "post.created": "membuat post",
    "post.updated": "mengubah post",
    "post.scheduled": "menjadwalkan post",
    "post.published": "menerbitkan post",
    "post.failed": "post gagal terbit",
    "post.deleted": "menghapus post",
    "media.uploaded": "mengunggah media",
    "media.deleted": "menghapus media",
    "account.connected": "menghubungkan akun",
    "account.disconnected": "memutus akun",
    "account.refreshed": "merefresh token akun",
    "team.invited": "mengundang anggota",
    "team.removed": "menghapus anggota",
    "team.role_changed": "mengubah peran anggota",
    "settings.updated": "mengubah pengaturan",
    "organization.created": "membuat workspace",
    "automation.created": "membuat automation",
    "automation.updated": "mengubah automation",
    "automation.deleted": "menghapus automation",
    "automation.triggered": "automation terpicu",
    "comment.replied": "membalas komentar",
    "competitor.created": "menambahkan competitor",
    "competitor.deleted": "menghapus competitor",
    "seb.report_generated": "membuat laporan Seb",
    "seb.recommendation_updated": "mengubah rekomendasi Seb",
    "seb.media_analyzed": "menganalisis media Seb",
    "listening.created": "membuat monitor",
    "listening.deleted": "menghapus monitor",
    "listening.synced": "sinkronisasi listening",
};

export interface ActivityResource {
    type: string;
    id: string;
    name?: string;
}

/**
 * Catat jejak aktivitas org. userId/userName opsional (bisa dari cron/system).
 */
export async function logActivity(
    organizationId: string,
    action: ActivityAction,
    resource: ActivityResource,
    details: Record<string, unknown> = {},
    actor: { userId?: string; userName?: string } = {},
) {
    try {
        await db.insert(schema.activity).values({
            id: randomUUID(),
            organizationId,
            userId: actor.userId || null,
            userName: actor.userName || null,
            action,
            resourceType: resource.type,
            resourceId: resource.id,
            resourceName: resource.name || "",
            details: Object.keys(details).length > 0 ? JSON.stringify(details) : null,
        });
        return true;
    } catch {
        // Jangan sampai aktivitas logging memutus alur utama.
        return false;
    }
}

export interface ActivityFilter {
    type?: string;
    userId?: string;
    search?: string;
}

export async function listActivityLogs(
    organizationId: string,
    filter: ActivityFilter = {},
    pagination: { limit: number; offset: number } = { limit: 50, offset: 0 },
) {
    const { limit, offset } = pagination;

    const conditions = [eq(schema.activity.organizationId, organizationId)];
    if (filter.type && filter.type !== "all") conditions.push(like(schema.activity.action, `${filter.type}.%`));
    if (filter.userId) conditions.push(eq(schema.activity.userId, filter.userId));

    const [logs, total] = await Promise.all([
        db.query.activity.findMany({
            where: and(...conditions),
            orderBy: [desc(schema.activity.createdAt)],
            limit: Math.min(Math.max(limit, 1), 200),
            offset: Math.max(offset, 0),
        }),
        db.$count(schema.activity, and(...conditions)),
    ]);

    return {
        logs: logs.map((log) => ({
            id: log.id,
            userId: log.userId,
            userName: log.userName,
            action: log.action as ActivityAction,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
            resourceName: log.resourceName,
            details: log.details ? safeParse(log.details) : {},
            createdAt: log.createdAt.toISOString(),
        })),
        total,
        hasMore: offset + logs.length < total,
    };
}

export async function getActivitySummary(organizationId: string) {
    const { logs } = await listActivityLogs(organizationId, {}, { limit: 200, offset: 0 });

    const byAction: Record<string, number> = {};
    const byUserMap = new Map<string, { userName: string | null; count: number }>();

    for (const log of logs) {
        const type = log.action.split(".")[0];
        byAction[type] = (byAction[type] || 0) + 1;

        const key = log.userId || "system";
        const cur = byUserMap.get(key) ?? { userName: log.userName, count: 0 };
        cur.count++;
        byUserMap.set(key, cur);
    }

    return {
        totalActions: logs.length,
        byAction,
        byUser: [...byUserMap.entries()].map(([userId, d]) => ({ userId, userName: d.userName, count: d.count })),
    };
}

function safeParse(json: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(json);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}