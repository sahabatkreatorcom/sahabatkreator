"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "/dashboard";

    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState(searchParams.get("email") || "");
    const [password, setPassword] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError("Password minimal 8 karakter.");
            return;
        }

        setLoading(true);
        const { error } = await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: redirectTo, // tautan verifikasi di email akan balik ke sini
        });
        setLoading(false);

        if (error) {
            setError(error.message ?? "Gagal membuat akun. Coba lagi.");
            return;
        }

        // requireEmailVerification aktif -> user perlu klik link di email dulu
        setSent(true);
    }

    if (sent) {
        return (
            <div className="rounded-md border border-border bg-muted p-4 text-sm">
                <p className="font-medium text-foreground">Cek email Anda</p>
                <p className="mt-1 text-muted-foreground">
                    Kami sudah kirim tautan verifikasi ke <span className="font-medium text-foreground">{email}</span>.
                    Klik tautan tersebut untuk mengaktifkan akun.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
                <div
                    role="alert"
                    className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red"
                >
                    {error}
                </div>
            )}

            <div>
                <Label htmlFor="name">Nama lengkap</Label>
                <Input
                    id="name"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Anda"
                />
            </div>

            <div>
                <Label htmlFor="email">Email kerja</Label>
                <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@brand.com"
                />
            </div>

            <div>
                <Label htmlFor="password">Password</Label>
                <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                />
            </div>

            <Button type="submit" className="w-full" loading={loading}>
                Buat akun
            </Button>

            <p className="text-center text-xs text-muted-foreground">
                Dengan mendaftar, Anda menyetujui Ketentuan Layanan dan Kebijakan Privasi.
            </p>
        </form>
    );
}