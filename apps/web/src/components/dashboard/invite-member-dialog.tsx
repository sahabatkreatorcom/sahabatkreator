"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const roles = [
    { value: "member", label: "Member — buat & publish konten sendiri" },
    { value: "admin", label: "Admin — kelola anggota & pengaturan" },
];

export function InviteMemberDialog() {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [role, setRole] = React.useState("member");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await authClient.$fetch("/organization/invite-member", {
            method: "POST",
            body: { email, role },
        });

        setLoading(false);
        if (error) {
            setError("Gagal mengirim undangan. Periksa kembali email tersebut.");
            return;
        }

        setEmail("");
        setOpen(false);
        router.refresh();
    }

    return (
        <>
            <Button size="sm" onClick={() => setOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Undang anggota
            </Button>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                title="Undang anggota tim"
                description="Undangan berlaku 7 hari dan dikirim lewat email."
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                            {error}
                        </div>
                    )}

                    <div>
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            required
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="rekan@brand.com"
                        />
                    </div>

                    <div>
                        <Label htmlFor="invite-role">Peran</Label>
                        <select
                            id="invite-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {roles.map((r) => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" loading={loading}>
                            Kirim undangan
                        </Button>
                    </div>
                </form>
            </Dialog>
        </>
    );
}