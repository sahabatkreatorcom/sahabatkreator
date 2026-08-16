"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
    id: string;
    userId: string;
    role: string;
    user: { name: string; email: string };
}

interface Props {
    open: boolean;
    onClose: () => void;
    currentUserId: string;
    currentMemberId: string;
    members: Member[];
}

export function TransferOwnershipDialog({ open, onClose, currentUserId, currentMemberId, members }: Props) {
    const router = useRouter();
    const [selectedMemberId, setSelectedMemberId] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const successors = members.filter(
        (m) => m.userId !== currentUserId && m.role.split(",").includes("owner")
    );

    async function handleTransfer() {
        if (!selectedMemberId) return;
        setLoading(true);
        setError(null);

        // 1. Dapatkan ID workspace aktif
        const { data: orgData } = await authClient.$fetch("/organization/get-active-member", {
            method: "GET",
        }) as { data: { organizationId: string } | null; error: unknown };

        const orgId = orgData?.organizationId;
        if (!orgId) {
            setError("Workspace tidak ditemukan.");
            setLoading(false);
            return;
        }

        // 2. Promote successor ke owner
        const { error: err1 } = await authClient.$fetch("/organization/update-member-role", {
            method: "POST",
            body: { memberId: selectedMemberId, role: "owner" },
        });
        if (err1) {
            setError("Gagal promosi anggota. Coba lagi.");
            setLoading(false);
            return;
        }

        // 3. Leave organization (harus berhasil karena sekarang bukan satu-satunya owner)
        const { error: err2 } = await authClient.$fetch("/organization/leave", {
            method: "POST",
            body: { organizationId: orgId },
        });

        setLoading(false);
        if (err2) {
            setError("Gagal keluar dari workspace. Role sudah dipromosikan — silakan coba lagi nanti.");
            return;
        }

        onClose();
        router.push("/login");
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onClose={() => { onClose(); setSelectedMemberId(""); setError(null); }}
            title="Transfer kepemilikan workspace"
            description="Pilih anggota yang akan menjadi owner baru, lalu Anda akan keluar dari workspace."
        >
            <div className="space-y-4">
                <div className="rounded-md border border-accent-amber/30 bg-accent-amber/10 px-3 py-2 text-xs text-accent-amber flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                        Pemilik workspace saat ini (<b>{members.find((m) => m.id === currentMemberId)?.user.name ?? "Anda"}</b>)
                        akan turun jabatan. Workspace tetap utuh, hanya pergantian owner.
                    </span>
                </div>

                {successors.length === 0 ? (
                    <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 shrink-0" />
                        Belum ada owner lain yang bisa dipilih.
                    </div>
                ) : (
                    <div>
                        <Label htmlFor="successor">Pilih owner baru</Label>
                        <select
                            id="successor"
                            value={selectedMemberId}
                            onChange={(e) => setSelectedMemberId(e.target.value)}
                            className={cn(
                                "mt-1.5 h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                !selectedMemberId && "text-muted-foreground"
                            )}
                        >
                            <option value="" disabled>
                                Pilih anggota...
                            </option>
                            {successors.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.user.name} ({m.user.email})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {error && (
                    <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => onClose()}>
                        Batal
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleTransfer}
                        disabled={!selectedMemberId || loading || successors.length === 0}
                    >
                        {loading ? (
                            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Memindahkan...</>
                        ) : (
                            "Transfer & Keluar"
                        )}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
