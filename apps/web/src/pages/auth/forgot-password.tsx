// Halaman Lupa Password — kirim link reset via email
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

export function ForgotPasswordPage() {
  useSeo({
    title: "Lupa Password",
    description: "Reset password akun Sahabat Kreator Anda.",
    path: "/forgot-password",
    noIndex: true,
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    // Selalu tampilkan sukses untuk mencegah email enumeration
    if (error) {
      toast.error("Terjadi kesalahan. Coba lagi nanti.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-2xl">Cek email Anda</h1>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Jika email <span className="font-medium">{email}</span> terdaftar, link reset password
          sudah kami kirim. Link berlaku 1 jam.
        </p>
        <Link to="/login" className="mt-6 inline-block">
          <Button variant="outline">Kembali ke Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-bold text-2xl">Lupa password?</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Masukkan email Anda dan kami kirimkan link reset password.
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Kirim Link Reset
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          to="/login"
          className="text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:underline"
        >
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
