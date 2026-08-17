import { auth } from "@sahabat-kreator/auth";
import { headers as _headers } from "next/headers";

type RequestHeaders = Awaited<ReturnType<typeof _headers>>;

/**
 * Team management — dibungkus dari better-auth organization plugin.
 * Metode org diekspos langsung di `auth.api` (listMembers, createInvitation, dll).
 */

export interface TeamMember {
    id: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    createdAt: string;
}

export interface TeamInvitation {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string | null;
    createdAt: string;
}

export async function listTeamMembers(
    headers: RequestHeaders,
): Promise<{ members: TeamMember[]; role: string }> {
    const result = await auth.api.listMembers({ headers });

    const members: TeamMember[] = result.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name || m.user.email,
        email: m.user.email,
        image: m.user.image ?? null,
        role: m.role,
        createdAt: m.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));

    return {
        members,
        role: members[0]?.role ?? "member",
    };
}

export async function inviteTeamMember(
    headers: RequestHeaders,
    input: { email: string; role?: string },
): Promise<{ invitation: TeamInvitation }> {
    const result = await authClientLikeInvite(headers, input);
    return {
        invitation: {
            id: result.id,
            email: result.email,
            role: result.role,
            status: result.status,
            expiresAt: result.expiresAt?.toISOString?.() ?? null,
            createdAt: result.createdAt?.toISOString?.() ?? new Date().toISOString(),
        },
    };
}

async function authClientLikeInvite(headers: RequestHeaders, input: { email: string; role?: string }) {
    const result = await auth.api.createInvitation({
        headers,
        body: {
            email: input.email,
            role: (input.role || "member") as "member" | "admin",
        },
    });
    return result as unknown as {
        id: string;
        email: string;
        role: string;
        status: string;
        expiresAt?: Date | null;
        createdAt?: Date | null;
    };
}

export async function listTeamInvitations(headers: RequestHeaders): Promise<TeamInvitation[]> {
    const result = await auth.api.listInvitations({ headers });

    return result.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt?.toISOString?.() ?? null,
        createdAt: inv.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));
}

export async function cancelTeamInvitation(headers: RequestHeaders, invitationId: string): Promise<void> {
    await auth.api.cancelInvitation({
        headers,
        body: { invitationId },
    });
}

export async function updateTeamMemberRole(
    headers: RequestHeaders,
    input: { memberId: string; role: string },
): Promise<void> {
    await auth.api.updateMemberRole({
        headers,
        body: {
            memberId: input.memberId,
            role: input.role,
        },
    });
}

export async function removeTeamMember(headers: RequestHeaders, memberId: string): Promise<void> {
    await auth.api.removeMember({
        headers,
        body: { memberIdOrEmail: memberId },
    });
}
