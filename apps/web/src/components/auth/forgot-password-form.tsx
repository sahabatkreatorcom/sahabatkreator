"use client";

import * as React from "react";
import { authClient, requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
    const [email, setEmail] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await requestPasswordReset({
            email,
            redirectTo: "/reset-password",
        });

        setLoading(false);

        // Selalu tampilkan pesan sukses walau email tidak terdaftar,
        // supaya tidak bocorkan mana email yang punya akun (email enumeration).
        if (!error) {
            setSent(true);
            return;
        }
        setError("Terjadi kesalahan. Coba lagi sebentar lagi.");
    }

    if (sent) {
        return (
            <div className="rounded-md border border-border bg-muted p-4 text-sm">
                <p className="font-medium text-foreground">Cek email Anda</p>
                <p className="mt-1 text-muted-foreground">
                    Jika <span className="font-medium text-foreground">{email}</span> terdaftar, kami sudah
                    kirim tautan untuk reset password. Tautan berlaku 1 jam.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            <div>
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@brand.com"
                />
            </div>

            <Button type="submit" className="w-full" loading={loading}>
                Kirim tautan reset
            </Button>
        </form>
    );
}