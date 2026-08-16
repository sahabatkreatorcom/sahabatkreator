import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;

    return (
        <div>
            <h1 className="text-xl font-semibold">Buat password baru</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Pilih password baru untuk akun Anda.
            </p>
            <div className="mt-6">
                <ResetPasswordForm token={token} />
            </div>
        </div>
    );
}