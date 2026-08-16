"use client";

import * as React from "react";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn, initials, ringColorFor } from "@/lib/utils";
import { TransferOwnershipDialog } from "./transfer-ownership-dialog";

interface Member {
    id: string;
    role: string;
    userId: string;
    user: { name: string; email: string };
}

const roleStyle: Record<string, string> = {
    owner: "bg-primary/15 text-primary",
    admin: "bg-accent-amber/15 text-accent-amber",
    member: "bg-muted text-muted-foreground",
};

export function MembersTable({
    members,
    currentUserId,
    currentMemberId,
    currentMemberRole,
}: {
    members: Member[];
    currentUserId: string;
    currentMemberId: string;
    currentMemberRole: string;
}) {
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
    const [leaving, setLeaving] = React.useState(false);
    const [leaveError, setLeaveError] = React.useState<string | null>(null);
    const [showTransfer, setShowTransfer] = React.useState(false);

    const isOwner = currentMemberRole.split(",").includes("owner");

    async function changeRole(memberId: string, role: string) {
        await authClient.$fetch("/organization/update-member-role", {
            method: "POST",
            body: { memberId, role },
        });
        setOpenMenuId(null);
        window.location.reload();
    }

    async function remove(memberId: string) {
        await authClient.$fetch("/organization/remove-member", {
            method: "POST",
            body: { memberIdOrEmail: memberId },
        });
        setOpenMenuId(null);
        window.location.reload();
    }

    async function leaveOrg() {
        if (!isOwner) return;
        setLeaving(true);
        setLeaveError(null);

        if (members.filter((m) => m.role.split(",").includes("owner")).length <= 1) {
            setShowTransfer(true);
            setLeaving(false);
            return;
        }

        const { error } = await authClient.$fetch("/organization/leave", {
            method: "POST",
            body: {},
        });
        setLeaving(false);
        if (error) {
            setLeaveError("Gagal keluar dari workspace.");
            return;
        }
        window.location.href = "/login";
    }

    return (
        <>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3">Anggota</th>
                            <th className="px-4 py-3">Peran</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {members.map((m) => {
                            const isMe = m.userId === currentUserId;
                            return (
                                <tr key={m.id} className={isMe ? "bg-muted/40" : ""}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                                style={{ backgroundColor: ringColorFor(m.user.email) }}
                                            >
                                                {initials(m.user.name)}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate font-medium">{m.user.name}</p>
                                                    {isMe && (
                                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                                            Anda
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", roleStyle[m.role])}>
                                            {m.role}
                                        </span>
                                    </td>
                                    <td className="relative px-4 py-3 text-right">
                                        {isMe ? (
                                            isOwner ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-xs text-muted-foreground">Pemilik workspace</span>
                                                    <button
                                                        onClick={leaveOrg}
                                                        disabled={leaving}
                                                        className="text-xs text-accent-red hover:underline disabled:opacity-50"
                                                    >
                                                        {leaving ? (
                                                            <span className="inline-flex items-center gap-1">
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                ...
                                                            </span>
                                                        ) : members.filter((mm) => mm.role.split(",").includes("owner")).length <= 1
                                                        ? "Transfer kepemilikan"
                                                        : "Keluar dari workspace"}
                                                    </button>
                                                    {leaveError && (
                                                        <p className="text-xs text-accent-red">{leaveError}</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Tidak ada aksi</span>
                                            )
                                        ) : (
                                            m.role !== "owner" && (
                                                <>
                                                    <button
                                                        onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                                                        aria-label="Opsi anggota"
                                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>
                                                    {openMenuId === m.id && (
                                                        <div
                                                            role="menu"
                                                            className="absolute right-4 top-[calc(100%-4px)] z-10 w-48 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                                                        >
                                                            <button
                                                                role="menuitem"
                                                                onClick={() => changeRole(m.id, m.role === "admin" ? "member" : "admin")}
                                                                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                                            >
                                                                {m.role === "admin" ? "Jadikan member" : "Jadikan admin"}
                                                            </button>
                                                            <button
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    changeRole(m.id, "owner");
                                                                    setOpenMenuId(null);
                                                                }}
                                                                className="block w-full px-3 py-2 text-left text-sm text-accent-amber hover:bg-accent-amber/10"
                                                            >
                                                                Jadikan owner
                                                            </button>
                                                            <button
                                                                role="menuitem"
                                                                onClick={() => remove(m.id)}
                                                                className="block w-full px-3 py-2 text-left text-sm text-accent-red hover:bg-accent-red/10"
                                                            >
                                                                Keluarkan dari workspace
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <TransferOwnershipDialog
                open={showTransfer}
                onClose={() => { setShowTransfer(false); setLeaving(false); }}
                currentUserId={currentUserId}
                currentMemberId={currentMemberId}
                members={members}
            />
        </>
    );
}
