// Halaman Pengaturan — profil, keamanan (2FA), notifikasi
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ImagePlus, Loader2, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  DataSection,
  OrganizationSection,
  SessionsSection,
} from "@/components/settings/account-data-sections";
import { AiUsageHistory } from "@/components/settings/ai-usage-history";
import { PushNotificationSettings } from "@/components/settings/push-notification-settings";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meQueryOptions } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";

/** Batas ukuran file avatar yang diizinkan (2 MB) */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Sisi maksimum avatar setelah resize (kompres via canvas agar payload kecil) */
const AVATAR_MAX_SIZE = 256;

/**
 * Baca file gambar → resize ke maksimum `maxSize` px via canvas → dataURL.
 * Dipakai untuk avatar profil supaya payload updateUser tetap kecil.
 */
function fileToResizedDataUrl(file: File, maxSize = AVATAR_MAX_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("File bukan gambar yang valid"));
      img.onload = () => {
        // Skala proporsional — sisi terpanjang maksimal maxSize
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas tidak didukung browser ini"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQueryOptions);
  const [name, setName] = useState(me?.user.name ?? "");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showTwoFAPassword, setShowTwoFAPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /** Upload avatar: validasi tipe & ukuran → resize via canvas → simpan ke user.image */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset agar file yang sama bisa dipilih ulang
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Ukuran foto maksimal 2 MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      const { error } = await authClient.updateUser({ image: dataUrl });
      if (error) {
        toast.error("Gagal mengunggah foto profil");
      } else {
        toast.success("Foto profil diperbarui");
        // Refresh data session/user — avatar di topbar ikut ter-update
        queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
      }
    } catch {
      toast.error("Gagal memproses gambar");
    } finally {
      setAvatarUploading(false);
    }
  };

  /** Hapus foto profil (user.image → null) */
  const handleRemoveAvatar = async () => {
    const { error } = await authClient.updateUser({ image: null });
    if (error) {
      toast.error("Gagal menghapus foto profil");
    } else {
      toast.success("Foto profil dihapus");
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const { error } = await authClient.updateUser({ name });
    if (error) {
      toast.error("Gagal menyimpan profil");
    } else {
      toast.success("Profil tersimpan");
    }
    setSavingProfile(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password baru minimal 8 karakter");
      return;
    }
    const { error } = await authClient.changePassword({
      currentPassword: password,
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      toast.error(error.message ?? "Password lama salah");
    } else {
      toast.success("Password berhasil diubah");
      setPassword("");
      setNewPassword("");
    }
  };

  const toggleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setTwoFactorLoading(true);
    try {
      if (me.user.twoFactorEnabled) {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) {
          toast.error(error.message ?? "Gagal menonaktifkan 2FA");
        } else {
          toast.success("2FA dinonaktifkan");
        }
      } else {
        const { error } = await authClient.twoFactor.enable({ password });
        if (error) {
          toast.error(error.message ?? "Gagal mengaktifkan 2FA");
        } else {
          toast.success("Kode OTP dikirim ke email Anda. Masukkan kode untuk konfirmasi.");
        }
      }
      // Refresh status 2FA
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const resendVerification = useMutation({
    mutationFn: () =>
      authClient.sendVerificationEmail({
        email: me?.user.email ?? "",
        // Harus absolut: link email dibuka di server, lalu server redirect
        // callbackURL — URL relatif akan jatuh ke origin server, bukan web.
        callbackURL: `${window.location.origin}/verify-email?verified=1`,
      }),
    onSuccess: () => toast.success("Email verifikasi dikirim"),
    onError: () => toast.error("Gagal mengirim email verifikasi"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Pengaturan</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Kelola profil dan keamanan akun Anda
        </p>
      </div>

      {/* Profil */}
      <form className="card space-y-4 p-6" onSubmit={updateProfile}>
        <h2 className="font-semibold">Profil</h2>
        {/* Foto profil — preview bulat + ubah/hapus */}
        <div className="flex items-center gap-4">
          <Avatar
            name={me?.user.name ?? "?"}
            src={me?.user.image ?? undefined}
            className="h-20 w-20 text-xl"
            alt="Foto profil"
          />
          <div className="space-y-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              aria-label="Pilih foto profil"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                Ubah Foto
              </Button>
              {me?.user.image && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-[var(--error)] hover:bg-[var(--error-light)]"
                  onClick={handleRemoveAvatar}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Foto
                </Button>
              )}
            </div>
            <p className="text-[var(--text-muted)] text-xs">
              JPG, PNG, atau WebP maksimal 2 MB — otomatis di-resize ke 256×256.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nama</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <div className="flex items-center gap-2">
            <Input value={me?.user.email ?? ""} disabled />
            {me?.user.emailVerified ? (
              <Badge variant="success">Terverifikasi</Badge>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => resendVerification.mutate()}
                disabled={resendVerification.isPending}
              >
                {resendVerification.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                Verifikasi
              </Button>
            )}
          </div>
        </div>
        <Button type="submit" disabled={savingProfile}>
          {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan Profil
        </Button>
      </form>

      {/* Keamanan */}
      <form className="card space-y-4 p-6" onSubmit={changePassword}>
        <h2 className="font-semibold">Ubah Password</h2>
        <div className="space-y-2">
          <Label htmlFor="current-password">Password Saat Ini</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
        <div className="space-y-2">
          <Label htmlFor="new-password">Password Baru</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              aria-label={showNewPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit">Ubah Password</Button>
      </form>

      {/* 2FA */}
      <form className="card space-y-4 p-6" onSubmit={toggleTwoFactor}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Autentikasi Dua Faktor (2FA)</h2>
              <p className="mt-1 text-[var(--text-secondary)] text-sm">
                Kode OTP 8 digit dikirim ke email Anda setiap kali login dari perangkat baru.
              </p>
            </div>
          </div>
          <Badge variant={me?.user.twoFactorEnabled ? "success" : "secondary"}>
            {me?.user.twoFactorEnabled ? "Aktif" : "Nonaktif"}
          </Badge>
        </div>
        <div className="space-y-2">
          <Label htmlFor="twofa-password">
            Konfirmasi Password{" "}
            {me?.user.twoFactorEnabled ? "(untuk menonaktifkan)" : "(untuk mengaktifkan)"}
          </Label>
          <div className="relative">
            <Input
              id="twofa-password"
              type={showTwoFAPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password akun Anda"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowTwoFAPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              aria-label={showTwoFAPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showTwoFAPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          variant={me?.user.twoFactorEnabled ? "destructive" : "primary"}
          disabled={twoFactorLoading || !password}
        >
          {twoFactorLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {me?.user.twoFactorEnabled ? "Nonaktifkan 2FA" : "Aktifkan 2FA"}
        </Button>
      </form>

      {/* Notifikasi push */}
      <PushNotificationSettings />

      {/* Riwayat pemakaian AI */}
      <AiUsageHistory />

      {/* Organisasi */}
      <OrganizationSection />

      {/* Sesi perangkat */}
      <SessionsSection />

      {/* Data pribadi (ekspor + hapus akun — UU PDP) */}
      <DataSection />
    </div>
  );
}
