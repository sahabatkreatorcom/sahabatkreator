import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { TwoFactorPanel } from "@/components/dashboard/security/two-factor-panel";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";

export default async function SecurityPage() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    return (
        <div className="max-w-xl space-y-4">
            <div>
                <h1 className="text-lg font-semibold">Keamanan akun</h1>
                <p className="text-sm text-muted-foreground">
                    Kelola password, verifikasi dua langkah, dan hapus akun Anda.
                </p>
            </div>

            <TwoFactorPanel enabled={!!session?.user.twoFactorEnabled} />
            <ChangePasswordForm />
            <DeleteAccountForm />
        </div>
    );
}
