"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export function ProfileForm({
    name,
    email,
    emailVerified,
}: {
    name: string;
    email: string;
    emailVerified: boolean;
}) {
    const [loading, setLoading] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [formName, setFormName] = React.useState(name);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setLoading(true);

        const { error } = await authClient.$fetch("/update-user", {
            method: "POST",
            body: { name: formName },
        });

        setLoading(false);
        if (error) {
            setError("Gagal memperbarui profil.");
            return;
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div className="space-y-2">
                <Label htmlFor="p-name">Nama lengkap</Label>
                <Input
                    id="p-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nama Anda"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="p-email">Email</Label>
                <div className="flex items-center gap-2">
                    <Input id="p-email" value={email} disabled className="bg-muted" />
                    {emailVerified && (
                        <CheckCircle2 className="h-4 w-4 text-accent-green shrink-0" aria-label="Terverifikasi" />
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    Email saat ini tidak bisa diganti. Hubungi admin jika perlu mengubahnya.
                </p>
            </div>

            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            {saved && (
                <div className="rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
                    Profil berhasil disimpan.
                </div>
            )}

            <Button type="submit" loading={loading}>
                Simpan perubahan
            </Button>
        </form>
    );
}
