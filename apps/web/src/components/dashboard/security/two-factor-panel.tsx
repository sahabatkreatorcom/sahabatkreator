import { ShieldAlert } from "lucide-react";
import { EnableTwoFactorFlow } from "@/components/dashboard/security/enable-two-factor-flow";
import { TwoFactorActivePanel } from "@/components/dashboard/security/two-factor-active-panel";

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
    if (enabled) return <TwoFactorActivePanel />;

    return (
        <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent-amber" />
                <div>
                    <p className="text-sm font-semibold">Verifikasi dua langkah belum aktif</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Tambahkan lapisan keamanan ekstra memakai aplikasi authenticator seperti
                        Google Authenticator atau Authy.
                    </p>
                </div>
            </div>
            <div className="mt-4">
                <EnableTwoFactorFlow />
            </div>
        </div>
    );
}