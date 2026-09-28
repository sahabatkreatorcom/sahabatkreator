// Halaman 2FA — input OTP 8 digit (email) setelah login password benar
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSyncSession } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

const OTP_LENGTH = 8;

export function TwoFactorPage() {
  useSeo({
    title: "Verifikasi Dua Faktor",
    description: "Masukkan kode OTP untuk menyelesaikan login.",
    path: "/two-factor",
    noIndex: true,
  });

  const navigate = useNavigate();
  const syncSession = useSyncSession();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (code.length !== OTP_LENGTH) {
      toast.error(`Kode OTP harus ${OTP_LENGTH} digit`);
      return;
    }

    setLoading(true);
    const { error } = await authClient.twoFactor.verifyOtp({
      code,
    });

    if (error) {
      toast.error("Kode OTP salah atau sudah kedaluwarsa");
      setLoading(false);
      return;
    }

    await syncSession();
    toast.success("Verifikasi berhasil!");
    navigate("/dashboard", { replace: true });
  }

  async function handleResend() {
    setResending(true);
    const { error } = await authClient.twoFactor.sendOtp();
    if (error) {
      toast.error("Gagal mengirim ulang kode. Coba lagi nanti.");
    } else {
      toast.success("Kode OTP baru sudah dikirim ke email Anda");
    }
    setResending(false);
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-2xl">Verifikasi Dua Faktor</h1>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Masukkan kode {OTP_LENGTH} digit yang kami kirim ke email Anda.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          placeholder="••••••••"
          className="text-center font-semibold text-xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        />
        <Button type="submit" className="w-full" disabled={loading || !code}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Verifikasi
        </Button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-[var(--text-muted)] text-sm hover:text-[var(--accent-gold)] hover:underline disabled:opacity-50"
        >
          {resending ? "Mengirim ulang..." : "Tidak menerima kode? Kirim ulang"}
        </button>
      </div>
    </div>
  );
}
