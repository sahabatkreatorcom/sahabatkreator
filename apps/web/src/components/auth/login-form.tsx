"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "/dashboard";

    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { data, error } = await authClient.signIn.email({ email, password });

        setLoading(false);

        if (error) {
            setError(
                error.code === "EMAIL_NOT_VERIFIED"
                    ? "Email belum diverifikasi. Cek inbox Anda."
                    : "Email atau password salah."
            );
            return;
        }

        if (redirectTo && redirectTo !== "/dashboard") {
            router.push(redirectTo as any);
        } else {
            router.push("/dashboard" as any);
        }
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
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@brand.com"
                />
            </div>

            <div>
                <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                        Lupa password?
                    </Link>
                </div>
                <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                />
            </div>

            <Button type="submit" className="w-full" loading={loading}>
                Masuk
            </Button>
        </form>
    );
}