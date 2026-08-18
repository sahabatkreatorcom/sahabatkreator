"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "totp" | "email-otp" | "backup-code";

const modeLabel: Record<Mode, string> = {
    totp: "Kode dari aplikasi authenticator",
    "email-otp": "Kode dikirim ke email",
    "backup-code": "Kode cadangan",
};

export function Verify2FAForm() {
    const router = useRouter();
    const [mode, setMode] = React.useState<Mode>("totp");
    const [code, setCode] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [otpSent, setOtpSent] = React.useState(false);
    const [sendingOtp, setSendingOtp] = React.useState(false);

    async function handleSendOtp() {
        setSendingOtp(true);
        setError(null);
        const { error } = await authClient.twoFactor.sendOtp();
        setSendingOtp(false);
        if (error) {
            setError("Gagal mengirim kode. Coba lagi.");
            return;
        }
        setOtpSent(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const result =
            mode === "totp"
                ? await authClient.twoFactor.verifyTotp({ code, trustDevice: true })
                : mode === "email-otp"
                    ? await authClient.twoFactor.verifyOtp({ code, trustDevice: true })
                    : await authClient.twoFactor.verifyBackupCode({ code });

        setLoading(false);

        if (result.error) {
            setError("Kode salah atau sudah kedaluwarsa.");
            return;
        }

        const redirectTo = sessionStorage.getItem("post-login-redirect") || "/dashboard";
        sessionStorage.removeItem("post-login-redirect");
        router.push(redirectTo as any);
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-1 rounded-md border border-border bg-muted p-0.5 text-xs">
                {(["totp", "email-otp", "backup-code"] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => {
                            setMode(m);
                            setError(null);
                            setCode("");
                        }}
                        className={`flex-1 rounded-[calc(var(--radius-md)-3px)] py-1.5 font-medium transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            }`}
                    >
                        {m === "totp" ? "Authenticator" : m === "email-otp" ? "Email" : "Cadangan"}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                    <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                        {error}
                    </div>
                )}

                {mode === "email-otp" && !otpSent && (
                    <Button type="button" variant="secondary" className="w-full" loading={sendingOtp} onClick={handleSendOtp}>
                        Kirim kode ke email
                    </Button>
                )}

                {(mode !== "email-otp" || otpSent) && (
                    <>
                        <div>
                            <Label htmlFor="code">{modeLabel[mode]}</Label>
                            <Input
                                id="code"
                                inputMode={mode === "backup-code" ? "text" : "numeric"}
                                autoComplete="one-time-code"
                                required
                                autoFocus
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder={mode === "backup-code" ? "xxxxxxxx" : "123456"}
                                className="text-center text-lg tracking-[0.3em]"
                            />
                        </div>
                        <Button type="submit" className="w-full" loading={loading}>
                            Verifikasi
                        </Button>
                    </>
                )}
            </form>
        </div>
    );
}