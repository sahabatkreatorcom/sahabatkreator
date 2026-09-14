// Halaman Reset Password — set password baru dari link email
import { Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

export function ResetPasswordPage() {
  useSeo({
    title: "Reset Password",
    description: "Atur password baru akun Sahabat Kreator Anda.",
    path: "/reset-password",
    noIndex: true,
  });

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Link reset tidak valid atau sudah kedaluwarsa");
      navigate("/forgot-password", { replace: true });
    }
  }, [token, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password minimal 8 karakter");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Konfirmasi password tidak sama");
      return;
    }

    setLoading(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? "",
    });

    if (error) {
      toast.error(error.message ?? "Reset password gagal. Link mungkin kedaluwarsa.");
      setLoading(false);
      return;
    }

    toast.success("Password berhasil diubah. Silakan masuk kembali.");
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-bold text-2xl">Atur password baru</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Buat password baru yang kuat untuk akun Anda.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password baru</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Konfirmasi password</Label>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Ulangi password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !token}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Simpan Password Baru
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
