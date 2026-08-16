"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [role, setRole] = React.useState("user");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await authClient.admin.createUser({ name, email, password, role: role as "user" | "admin" });

        setLoading(false);
        if (error) {
            setError("Gagal membuat user. Periksa kembali data yang dimasukkan.");
            return;
        }

        setName("");
        setEmail("");
        setPassword("");
        setRole("user");
        setOpen(false);
        onCreated();
    }

    return (
        <>
            <Button size="sm" onClick={() => setOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Buat user
            </Button>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                title="Buat user baru"
                description="User dibuat langsung tanpa proses verifikasi email."
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                            {error}
                        </div>
                    )}

                    <div>
                        <Label htmlFor="cu-name">Nama</Label>
                        <Input id="cu-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="cu-email">Email</Label>
                        <Input id="cu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="cu-password">Password sementara</Label>
                        <Input
                            id="cu-password"
                            type="password"
                            required
                            minLength={8}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimal 8 karakter"
                        />
                    </div>
                    <div>
                        <Label htmlFor="cu-role">Role platform</Label>
                        <select
                            id="cu-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="user">User biasa</option>
                            <option value="admin">Admin platform</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" loading={loading}>
                            Buat user
                        </Button>
                    </div>
                </form>
            </Dialog>
        </>
    );
}