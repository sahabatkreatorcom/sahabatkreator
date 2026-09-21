// Halaman Login — email/password dengan dukungan 2FA OTP
import { Eye, EyeOff, Loader2, LogIn, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncSession } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

export function LoginPage() {
  useSeo({
    title: "Masuk",
    description: "Masuk ke akun Sahabat Kreator Anda.",
    path: "/login",
    noIndex: true,
  });

  const navigate = useNavigate();
  const syncSession = useSyncSession();
  const [params] = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Email belum terverifikasi → tampilkan panel kirim ulang link verifikasi
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!unverifiedEmail || resending) return;
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: `${window.location.origin}/verify-email?verified=1`,
    });
    setResending(false);
    if (error) {
      toast.error(error.message ?? "Gagal mengirim ulang email verifikasi");
      return;
    }
    toast.success("Link verifikasi telah dikirim ke email Anda");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setUnverifiedEmail(null);
    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      // Email belum terverifikasi — server sudah auto-resend (sendOnSignIn),
      // tetap tampilkan panel agar user tahu harus cek email (bukan salah password)
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email);
        setLoading(false);
        return;
      }
      toast.error(error.message ?? "Email atau password salah");
      setLoading(false);
      return;
    }

    // Jika 2FA aktif, plugin twoFactorClient otomatis redirect ke /two-factor.

    // Refetch /me sebelum navigate — cache guest (authenticated:false) masih
    // fresh sehingga RequireAuth menendang balik ke login bila tidak disinkronkan
    await syncSession();
    toast.success("Berhasil masuk. Selamat datang kembali!");
    navigate(redirectTo, { replace: true });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-bold text-2xl">Masuk ke akun Anda</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Belum punya akun?{" "}
          <Link to="/register" className="font-medium text-[var(--accent-gold)] hover:underline">
            Daftar gratis
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-[var(--text-muted)] text-xs hover:text-[var(--accent-gold)] hover:underline"
            >
              Lupa password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Masuk
        </Button>
      </form>

      {unverifiedEmail && (
        <div className="card mt-4 space-y-3 p-4 text-center">
          <MailCheck className="mx-auto h-8 w-8 text-[var(--accent-gold)]" />
          <p className="text-sm">
            Email <span className="font-medium">{unverifiedEmail}</span> belum diverifikasi. Kami
            baru saja mengirim link verifikasi — buka email Anda dan klik link tersebut.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}
            Kirim ulang link verifikasi
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-[var(--text-muted)] text-xs">
        Dengan masuk, Anda menyetujui{" "}
        <Link to="/syarat-ketentuan" className="underline">
          Syarat & Ketentuan
        </Link>{" "}
        dan{" "}
        <Link to="/kebijakan-privasi" className="underline">
          Kebijakan Privasi
        </Link>{" "}
        kami.
      </p>
    </div>
  );
}
