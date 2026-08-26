import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { decryptToken } from "@/lib/token-encryption";
import { replyToComment } from "@/lib/inbox/reply";
import type { Platform } from "@/lib/platforms";

// ─── Saved Responses ───────────────────────────────────────────────────────

export interface SavedResponseInput {
    name: string;
    content: string;
    shortcut?: string;
    category?: string;
}

export async function listSavedResponses(organizationId: string) {
    return db.query.savedResponse.findMany({
        where: eq(schema.savedResponse.organizationId, organizationId),
        orderBy: [desc(schema.savedResponse.usageCount), desc(schema.savedResponse.createdAt)],
    });
}

export async function createSavedResponse(organizationId: string, data: SavedResponseInput) {
    if (!data.name?.trim()) return { status: 400, error: "Nama balasan wajib diisi." };
    if (!data.content?.trim()) return { status: 400, error: "Isi balasan wajib diisi." };

    const existing = await db.query.savedResponse.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.name, data.name.trim())),
        columns: { id: true },
    });
    if (existing) return { status: 409, error: "Nama balasan sudah dipakai." };

    const shortcut = data.shortcut?.trim().startsWith("/") ? data.shortcut.trim() : data.shortcut?.trim() ? `/${data.shortcut.trim()}` : null;

    const response = await db
        .insert(schema.savedResponse)
        .values({
            id: randomUUID(),
            organizationId,
            name: data.name.trim(),
            content: data.content,
            shortcut: shortcut || null,
            category: data.category?.trim() || null,
        })
        .returning();
    return { status: 201, response: response[0] };
}

export async function updateSavedResponse(organizationId: string, id: string, data: Partial<SavedResponseInput>) {
    const existing = await db.query.savedResponse.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Balasan tidak ditemukan." };

    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.content !== undefined) values.content = data.content;
    if (data.shortcut !== undefined) {
        const s = data.shortcut?.trim();
        values.shortcut = s ? (s.startsWith("/") ? s : `/${s}`) : null;
    }
    if (data.category !== undefined) values.category = data.category?.trim() || null;

    await db.update(schema.savedResponse).set(values).where(eq(schema.savedResponse.id, id));
    return { status: 200, ok: true };
}

export async function deleteSavedResponse(organizationId: string, id: string) {
    const existing = await db.query.savedResponse.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Balasan tidak ditemukan." };
    await db.delete(schema.savedResponse).where(eq(schema.savedResponse.id, id));
    return { status: 200, ok: true };
}

/** Naikkan usageCount ketika balasan siap pakai dipakai. */
export async function bumpSavedResponseUsage(organizationId: string, id: string) {
    const existing = await db.query.captionTemplate.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { usageCount: true },
    });
    if (!existing) return;
    await db.update(schema.captionTemplate)
        .set({ usageCount: (existing.usageCount ?? 0) + 1 })
        .where(eq(schema.captionTemplate.id, id));
}

// ─── Automations ───────────────────────────────────────────────────────────

export interface AutomationInput {
    name: string;
    platform: Platform;
    keywords: string[];
    message: string;
    isActive?: boolean;
}

export async function listAutomations(organizationId: string) {
    const automations = await db.query.automation.findMany({
        where: eq(schema.automation.organizationId, organizationId),
        orderBy: [desc(schema.automation.createdAt)],
    });
    return automations.map((a) => ({
        ...a,
        keywords: parseTrigger(a.trigger),
    }));
}

function parseTrigger(trigger: string): string[] {
    return trigger.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
}

export async function createAutomation(organizationId: string, data: AutomationInput) {
    if (!data.name?.trim()) return { status: 400, error: "Nama automation wajib diisi." };
    if (!data.message?.trim()) return { status: 400, error: "Pesan balasan wajib diisi." };
    if (!data.keywords?.length) return { status: 400, error: "Masukkan minimal satu keyword." };

    const existing = await db.query.automation.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.name, data.name.trim())),
        columns: { id: true },
    });
    if (existing) return { status: 409, error: "Nama automation sudah dipakai." };

    const automation = await db
        .insert(schema.automation)
        .values({
            id: randomUUID(),
            organizationId,
            name: data.name.trim(),
            trigger: data.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).join(","),
            platform: data.platform,
            message: data.message,
            isActive: data.isActive !== false,
        })
        .returning();
    return { status: 201, automation: { ...automation[0], keywords: parseTrigger(automation[0].trigger) } };
}

export async function updateAutomation(organizationId: string, id: string, data: Partial<AutomationInput>) {
    const existing = await db.query.automation.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Automation tidak ditemukan." };

    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.platform !== undefined) values.platform = data.platform;
    if (data.message !== undefined) values.message = data.message;
    if (data.isActive !== undefined) values.isActive = data.isActive;
    if (data.keywords !== undefined) values.trigger = data.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).join(",");

    await db.update(schema.automation).set(values).where(eq(schema.automation.id, id));
    return { status: 200, ok: true };
}

export async function deleteAutomation(organizationId: string, id: string) {
    const existing = await db.query.automation.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Automation tidak ditemukan." };
    await db.delete(schema.automation).where(eq(schema.automation.id, id));
    return { status: 200, ok: true };
}

/**
 * Auto-reply: cek komentar baru terhadap automation aktif platform tsb.
 * Bila ada keyword cocok → balas otomatis + catat stats (triggered/delivered).
 * Dipanggil dari inbox sync untuk komentar yang BARU ditambahkan.
 */
export async function processAutomationForComment(comment: {
    organizationId: string;
    socialAccountId: string;
    platform: Platform;
    platformPostId: string;
    platformCommentId: string;
    authorUsername: string;
    text: string;
}) {
    const automations = await db.query.automation.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, comment.organizationId), _eq(t.platform, comment.platform), _eq(t.isActive, true)),
        columns: { id: true, trigger: true, message: true },
    });

    const text = comment.text.toLowerCase();
    const matched = automations.find((a) => {
        const keywords = parseTrigger(a.trigger);
        return keywords.some((k) => text.includes(k));
    });
    if (!matched) return;

    const account = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.id, comment.socialAccountId), _eq(t.organizationId, comment.organizationId)),
        columns: { id: true, organizationId: true, platform: true, accessToken: true },
    });
    if (!account) return;

    const result = await replyToComment(
        {
            id: account.id,
            organizationId: account.organizationId,
            platform: account.platform,
            accessToken: decryptToken(account.accessToken),
        },
        comment.platformPostId,
        comment.platformCommentId,
        matched.message,
    );

    const commentRow = await db.query.comment.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.socialAccountId, comment.socialAccountId), _eq(t.platformCommentId, comment.platformCommentId)),
        columns: { id: true, replyCount: true },
    });
    if (commentRow) {
        await db.update(schema.comment)
            .set({ isReplied: true, replyCount: (commentRow.replyCount ?? 0) + 1 })
            .where(eq(schema.comment.id, commentRow.id));
    }

    const delivered = result.success ? 1 : 0;
    const automationRow = await db.query.automation.findFirst({
        where: eq(schema.automation.id, matched.id),
        columns: { triggered: true, delivered: true },
    });
    await db.update(schema.automation)
        .set({
            triggered: (automationRow?.triggered ?? 0) + 1,
            delivered: (automationRow?.delivered ?? 0) + delivered,
        })
        .where(eq(schema.automation.id, matched.id));
}