"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Shield, Trash2, UserPlus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TeamMember {
    id: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    createdAt: string;
}

interface TeamInvitation {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string | null;
    createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-600",
    admin: "bg-purple-500/10 text-purple-600",
    member: "bg-primary/10 text-primary",
    viewer: "bg-muted text-muted-foreground",
};

export default function TeamPage() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("member");
    const [inviteLoading, setInviteLoading] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/team");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat tim.");
            setMembers(data.members ?? []);
            setInvitations(data.invitations ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat tim.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function invite() {
        const email = inviteEmail.trim();
        if (!email || inviteLoading) return;
        setInviteLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role: inviteRole }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal mengundang.");
            setInviteEmail("");
            setInviteOpen(false);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mengundang.");
        } finally {
            setInviteLoading(false);
        }
    }

    async function changeRole(memberId: string, role: string) {
        setEditingId(null);
        setBusyId(memberId);
        setError(null);
        try {
            const res = await fetch("/api/team", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ memberId, role }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal mengubah role.");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mengubah role.");
        } finally {
            setBusyId(null);
        }
    }

    async function remove(memberId: string) {
        if (!confirm("Hapus anggota ini dari tim?")) return;
        setBusyId(memberId);
        setError(null);
        try {
            const res = await fetch(`/api/team?memberId=${encodeURIComponent(memberId)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menghapus anggota.");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus anggota.");
        } finally {
            setBusyId(null);
        }
    }

    async function cancelInvitation(invitationId: string) {
        setBusyId(invitationId);
        setError(null);
        try {
            const res = await fetch(`/api/team?invitationId=${encodeURIComponent(invitationId)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal membatalkan undangan.");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal membatalkan undangan.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Anggota tim</h1>
                    <p className="text-sm text-muted-foreground">Kelola siapa saja yang punya akses ke workspace ini.</p>
                </div>
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    Undang anggota
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
            ) : (
                <>
                    <div className="rounded-lg border border-border bg-card">
                        <ul className="divide-y divide-border">
                            {members.map((m) => (
                                <li key={m.id} className="flex items-center gap-3 p-4">
                                    {m.image ? (
                                        <img src={m.image} alt={m.name} className="h-9 w-9 rounded-full object-cover" />
                                    ) : (
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                            {m.name.slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{m.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                                    </div>
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ROLE_COLORS[m.role] ?? "bg-muted")}>
                                        {ROLE_LABELS[m.role] ?? m.role}
                                    </span>
                                    <div className="relative">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busyId === m.id}
                                            onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                                        >
                                            {busyId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                                        </Button>
                                        {editingId === m.id && (
                                            <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
                                                {["admin", "member", "viewer"].map((role) => (
                                                    <button
                                                        key={role}
                                                        onClick={() => changeRole(m.id, role)}
                                                        className={cn(
                                                            "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                                                            m.role === role && "bg-muted font-medium"
                                                        )}
                                                    >
                                                        {ROLE_LABELS[role]}
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => remove(m.id)}
                                                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-accent-red hover:bg-accent-red/10"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Hapus
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {invitations.length > 0 && (
                        <div className="rounded-lg border border-border bg-card">
                            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold">Undangan pending</h2>
                            </div>
                            <ul className="divide-y divide-border">
                                {invitations.map((inv) => (
                                    <li key={inv.id} className="flex items-center gap-3 p-4">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                            <Mail className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{inv.email}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {ROLE_LABELS[inv.role] ?? inv.role}
                                                {" · "}
                                                {inv.expiresAt
                                                    ? `berlaku s/d ${new Date(inv.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
                                                    : "menunggu"}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busyId === inv.id}
                                            onClick={() => cancelInvitation(inv.id)}
                                        >
                                            {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            Batalkan
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Undang anggota tim" description="Undangan berlaku 7 hari dan dikirim lewat email.">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="team-invite-email">Email</Label>
                        <Input
                            id="team-invite-email"
                            type="email"
                            placeholder="rekan@brand.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-invite-role">Peran</Label>
                        <select
                            id="team-invite-role"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="member">Member — buat & publish konten</option>
                            <option value="admin">Admin — kelola anggota & pengaturan</option>
                            <option value="viewer">Viewer — hanya melihat</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
                            Batal
                        </Button>
                        <Button size="sm" disabled={inviteLoading || !inviteEmail.trim()} onClick={invite}>
                            {inviteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            Kirim undangan
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}