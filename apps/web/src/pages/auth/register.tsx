// Halaman Register — daftar akun baru + instruksi verifikasi email
// Flow (requireEmailVerification: true):
// 1. signUp → better-auth TIDAK membuat session (token:null), email verifikasi dikirim
// 2. User klik link di email → server verifikasi + auto-sign-in + redirect ke web
// 3. RequireAuth mendeteksi user tanpa org → wizard /create-organization
import { Eye, EyeOff, Loader2, MailCheck, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

/** Callback absolut ke halaman sukses verifikasi (origin web, bukan server API) */
function verifyCallbackURL(): string {
  return `${window.location.origin}/verify-email?verified=1`;
}

export function RegisterPage() {
  useSeo({
    title: "Daftar Akun",
    description:
      "Buat akun Sahabat Kreator gratis dan kelola semua social media Anda dari satu tempat.",
    path: "/register",
    noIndex: true,
  });

  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Setelah signUp sukses → tampilkan layar "cek email" (belum bisa login)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Countdown tombol kirim ulang (anti-spam, 60 detik)
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password minimal 8 karakter");
      return;
    }

    setLoading(true);
    const { data, error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: verifyCallbackURL(),
    });

    if (error) {
      // Duplicate email dengan requireEmailVerification → respons generik sukses
      // (anti user-enumeration). Tetap arahkan ke layar cek email.
      setPendingEmail(email);
      setLoading(false);
      return;
    }

    // data.token === null → session TIDAK dibuat sampai email diverifikasi.
    // Organisasi dibuat lewat wizard /create-organization setelah verifikasi.
    if (!data?.token) {
      setPendingEmail(email);
      setLoading(false);
      return;
    }

    // Fallback bila verifikasi tidak diwajibkan (session langsung ada)
    toast.success("Akun berhasil dibuat!");
    navigate("/dashboard", { replace: true });
  }

  async function handleResend() {
    if (!pendingEmail || resending || cooldown > 0) return;
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: pendingEmail,
      callbackURL: verifyCallbackURL(),
    });
    setResending(false);
    if (error) {
      toast.error(error.message ?? "Gagal mengirim ulang email verifikasi");
      return;
    }
    setCooldown(60);
    toast.success("Email verifikasi telah dikirim ulang");
  }

  const strength = getPasswordStrength(password);

  // ---------- Layar "cek email" setelah signUp ----------
  if (pendingEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-2xl">Cek email Anda</h1>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Kami mengirim link verifikasi ke{" "}
          <span className="font-medium text-[var(--text-primary)]">{pendingEmail}</span>. Klik link
          tersebut untuk mengaktifkan akun Anda.
        </p>
        <p className="mt-2 text-[var(--text-muted)] text-xs">
          Tidak menemukan email? Cek folder spam, atau kirim ulang di bawah ini.
        </p>
        <Button
          onClick={handleResend}
          variant="outline"
          className="mt-6 w-full"
          disabled={resending || cooldown > 0}
        >
          {resending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {cooldown > 0 ? `Kirim ulang (${cooldown}s)` : "Kirim ulang email verifikasi"}
        </Button>
        <p className="mt-4 text-[var(--text-muted)] text-xs">
          Salah email?{" "}
          <button
            type="button"
            className="text-[var(--accent-gold)] hover:underline"
            onClick={() => {
              setPendingEmail(null);
              setPassword("");
            }}
          >
            Daftar ulang
          </button>
        </p>
      </div>
    );
  }

  // ---------- Form register ----------
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-bold text-2xl">Buat akun gratis</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Sudah punya akun?{" "}
          <Link to="/login" className="font-medium text-[var(--accent-gold)] hover:underline">
            Masuk di sini
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nama lengkap</Label>
          <Input
            id="name"
            required
            autoComplete="name"
            placeholder="Nama Anda"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
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
          {password && (
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className={`h-full transition-all ${
                    strength <= 1
                      ? "w-1/3 bg-red-500"
                      : strength === 2
                        ? "w-2/3 bg-yellow-500"
                        : "w-full bg-green-500"
                  }`}
                />
              </div>
              <span className="text-[var(--text-muted)] text-xs">
                {strength <= 1 ? "Lemah" : strength === 2 ? "Sedang" : "Kuat"}
              </span>
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Daftar Gratis
        </Button>
      </form>

      <p className="mt-6 text-center text-[var(--text-muted)] text-xs">
        Dengan mendaftar, Anda menyetujui{" "}
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

function getPasswordStrength(password: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
