import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import {
    cancelTeamInvitation,
    inviteTeamMember,
    listTeamInvitations,
    listTeamMembers,
    removeTeamMember,
    updateTeamMemberRole,
} from "@/lib/team";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["owner", "admin", "member", "viewer"];

/** GET /api/team — anggota + undangan workspace. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    try {
        const [team, invitations] = await Promise.all([
            listTeamMembers(ctx.headers),
            listTeamInvitations(ctx.headers),
        ]);
        return json({ ...team, invitations });
    } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Gagal memuat tim.", members: [], invitations: [] });
    }
});

/** POST /api/team — undang anggota baru. Body: { email, role? } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { email?: string; role?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "Email tidak valid." }, { status: 400 });
    }
    const role = body.role && VALID_ROLES.includes(body.role) ? body.role : "member";
    if (role === "owner") return json({ error: "Tidak bisa mengundang dengan role owner." }, { status: 400 });

    try {
        const { invitation } = await inviteTeamMember(ctx.headers, { email, role });
        await logActivity(
            activeOrganizationId,
            "team.invited",
            { type: "invitation", id: invitation.id, name: invitation.email },
            {},
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
        return json({ invitation }, { status: 201 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal mengundang anggota.";
        return json({ error: message }, { status: 400 });
    }
});

/** PATCH /api/team — ubah role anggota. Body: { memberId, role } */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { memberId?: string; role?: string } | null;
    if (!body?.memberId || !body.role || !VALID_ROLES.includes(body.role)) {
        return json({ error: "Member ID dan role valid wajib." }, { status: 400 });
    }
    if (body.role === "owner") return json({ error: "Role owner tidak bisa diubah lewat sini." }, { status: 400 });

    try {
        await updateTeamMemberRole(ctx.headers, { memberId: body.memberId, role: body.role });
        await logActivity(
            activeOrganizationId,
            "team.role_changed",
            { type: "member", id: body.memberId, name: body.role },
            {},
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
        return json({ success: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal mengubah role.";
        return json({ error: message }, { status: 400 });
    }
});

/** DELETE /api/team — hapus anggota atau batalkan undangan. Query: ?memberId= / ?invitationId= */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const invitationId = searchParams.get("invitationId");
    if (!memberId && !invitationId) return json({ error: "memberId atau invitationId wajib." }, { status: 400 });

    try {
        if (memberId) {
            await removeTeamMember(ctx.headers, memberId);
            await logActivity(
                activeOrganizationId,
                "team.removed",
                { type: "member", id: memberId },
                {},
                { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
            );
        } else {
            await cancelTeamInvitation(ctx.headers, invitationId!);
            await logActivity(
                activeOrganizationId,
                "team.removed",
                { type: "invitation", id: invitationId! },
                {},
                { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
            );
        }
        return json({ success: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal menghapus.";
        return json({ error: message }, { status: 400 });
    }
});