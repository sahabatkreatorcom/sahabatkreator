// Halaman Verify Email — konfirmasi dari link email
// Flow link verifikasi (absolut): email → server /api/auth/verify-email →
//   sukses: auto-sign-in + redirect ke ?verified=1 → halaman ini
//   gagal:   redirect ke ?error=<code> → halaman ini
// Token juga bisa diverifikasi langsung dari sini (tanpa callbackURL agar
// respons JSON, bukan redirect — session tetap ter-set via cookie).
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncSession } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

const ERROR_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: "Link verifikasi sudah kedaluwarsa. Kirim ulang email verifikasi di bawah ini.",
  INVALID_TOKEN: "Link verifikasi tidak valid. Minta yang baru lewat form di bawah ini.",
  USER_NOT_FOUND: "Akun tidak ditemukan. Daftar ulang atau hubungi dukungan.",
  INVALID_USER: "Link verifikasi tidak cocok dengan akun Anda.",
};

export function VerifyEmailPage() {
  useSeo({
    title: "Verifikasi Email",
    description: "Verifikasi alamat email akun Sahabat Kreator Anda.",
    path: "/verify-email",
    noIndex: true,
  });

  const navigate = useNavigate();
  const syncSession = useSyncSession();
  const [params] = useSearchParams();
  const token = params.get("token");
  const verified = params.get("verified");
  const errorCode = params.get("error");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">(
    token ? "loading" : verified ? "success" : errorCode ? "error" : "idle",
  );
  const hasRun = useRef(false);

  // Prefill email dari session (kasus user sudah login, token expired)
  const { data: session } = authClient.useSession();
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (session?.user?.email && !resendEmail) setResendEmail(session.user.email);
  }, [session, resendEmail]);

  useEffect(() => {
    if (!token || hasRun.current) return;
    hasRun.current = true;

    // Tanpa callbackURL → respons JSON (tidak redirect ke diri sendiri);
    // autoSignInAfterVerification tetap membuat session + set cookie.
    authClient.verifyEmail({ query: { token } }).then(({ error }) => {
      if (error) {
        setStatus("error");
        toast.error("Link verifikasi tidak valid atau sudah dipakai");
      } else {
        setStatus("success");
        toast.success("Email berhasil diverifikasi!");
      }
    });
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail || resending) return;
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: resendEmail,
      callbackURL: `${window.location.origin}/verify-email?verified=1`,
    });
    setResending(false);
    if (error) {
      toast.error(error.message ?? "Gagal mengirim email verifikasi");
      return;
    }
    setResent(true);
    toast.success("Email verifikasi telah dikirim");
  }

  return (
    <div className="text-center">
      {status === "loading" && (
        <>
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[var(--accent-gold)]" />
          <h1 className="font-bold text-2xl">Memverifikasi email...</h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">Mohon tunggu sebentar.</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="font-bold text-2xl">Email terverifikasi!</h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            Akun Anda sudah aktif. Lanjutkan untuk mulai menggunakan Sahabat Kreator.
          </p>
          <Button
            className="mt-6"
            onClick={async () => {
              // auto-sign-in dari verifikasi → cache ["me"] perlu disinkronkan
              // agar RequireAuth tidak menendang balik ke /login
              await syncSession();
              navigate("/dashboard", { replace: true });
            }}
          >
            Lanjut ke Dashboard
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="font-bold text-2xl">Verifikasi gagal</h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            {(errorCode && ERROR_MESSAGES[errorCode]) ??
              "Link verifikasi tidak valid atau sudah dipakai."}
          </p>
          <form
            onSubmit={handleResend}
            className="card mx-auto mt-6 max-w-sm space-y-3 p-4 text-left"
          >
            <div className="space-y-2">
              <Label htmlFor="resend-email">Kirim ulang ke email</Label>
              <Input
                id="resend-email"
                type="email"
                required
                placeholder="nama@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={resending || resent}>
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {resent ? "Terkirim — cek email Anda" : "Kirim ulang link verifikasi"}
            </Button>
          </form>
        </>
      )}

      {status === "idle" && (
        <>
          <h1 className="font-bold text-2xl">Verifikasi Email</h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            Buka link verifikasi dari email Anda, atau kirim ulang lewat form di bawah ini.
          </p>
          <form
            onSubmit={handleResend}
            className="card mx-auto mt-6 max-w-sm space-y-3 p-4 text-left"
          >
            <div className="space-y-2">
              <Label htmlFor="resend-email">Email akun Anda</Label>
              <Input
                id="resend-email"
                type="email"
                required
                placeholder="nama@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={resending || resent}>
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {resent ? "Terkirim — cek email Anda" : "Kirim ulang link verifikasi"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
