// Section Pengaturan: Organisasi, Sesi Perangkat, Data Pribadi (ekspor + hapus akun)
// Kepatuhan UU PDP: hak akses (ekspor) & hak penghapusan (delete account).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Download,
  Loader2,
  LogOut,
  Monitor,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meQueryOptions } from "@/layouts/require-auth";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Organisasi — ganti nama + slug
// ---------------------------------------------------------------------------

export function OrganizationSection() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQueryOptions);
  const org = me?.organization;
  const [name, setName] = useState(org?.name ?? "");

  const update = useMutation({
    mutationFn: (data: { name: string; slug?: string }) =>
      authClient.organization.update({ organizationId: org!.id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
      toast.success("Organisasi tersimpan");
    },
    onError: () => toast.error("Gagal menyimpan organisasi"),
  });

  if (!org) return null;

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && name !== org.name) update.mutate({ name: name.trim() });
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Organisasi</h2>
          <p className="text-[var(--text-secondary)] text-sm">
            Nama organisasi tampil di seluruh workspace
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-name">Nama Organisasi</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>
      <Button type="submit" disabled={update.isPending || !name.trim() || name === org.name}>
        {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Simpan Organisasi
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sesi perangkat aktif — list + revoke
// ---------------------------------------------------------------------------

type Session = {
  id: string;
  userAgent: string;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
};

function deviceLabel(ua: string): string {
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Perangkat tidak dikenal";
}

function browserLabel(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome/i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/firefox/i.test(ua)) return "Firefox";
  return "Browser";
}

export function SessionsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => authClient.listSessions(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      authClient.revokeSession({ token: id }).catch(() => {
        // better-auth revoke pakai token — beberapa versi pakai id
        throw new Error("Gagal mencabut sesi");
      }),
    onSuccess: () => toast.success("Sesi dicabut"),
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeOthers = useMutation({
    mutationFn: () => authClient.revokeOtherSessions(),
    onSuccess: () => toast.success("Semua sesi lain dicabut"),
    onError: () => toast.error("Gagal mencabut sesi lain"),
  });

  const sessions = data?.data ?? [];

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Sesi Perangkat Aktif</h2>
            <p className="text-[var(--text-secondary)] text-sm">
              Perangkat yang sedang login ke akun Anda
            </p>
          </div>
        </div>
        {sessions.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            {revokeOthers.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Cabut Semua Lain
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">Tidak ada sesi aktif.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const ua = String(s.userAgent ?? "");
            const isCurrent = Boolean((s as { current?: boolean }).current);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">
                      {deviceLabel(ua)} · {browserLabel(ua)}
                    </p>
                    {isCurrent && (
                      <Badge variant="success" className="scale-90">
                        Sesi ini
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[var(--text-muted)] text-xs">
                    Login {formatDate(s.createdAt)} · IP {s.ipAddress ?? "—"}
                  </p>
                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--error)] hover:bg-[var(--error-light)]"
                    onClick={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending && revoke.variables === s.id}
                  >
                    {revoke.isPending && revoke.variables === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    Cabut
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data pribadi — ekspor (hak akses UU PDP) + hapus akun (hak penghapusan)
// ---------------------------------------------------------------------------

export function DataSection() {
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await api.get<Record<string, unknown>>("/user/export-data");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sahabatkreator-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data Anda berhasil diekspor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== "HAPUS") {
      toast.error('Ketik "HAPUS" untuk konfirmasi');
      return;
    }
    setDeleting(true);
    try {
      await api.post("/user/delete-account", { confirm: confirmText });
      toast.success("Akun Anda telah dihapus permanen. Sampai jumpa!");
      window.location.href = "/";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus akun");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Ekspor data */}
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Ekspor Data Pribadi</h2>
            <p className="text-[var(--text-secondary)] text-sm">
              Unduh salinan data Anda (profil, post, media, produk) dalam format JSON — hak akses
              sesuai UU PDP.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Ekspor Data Saya
        </Button>
      </div>

      {/* Hapus akun */}
      <div className="card space-y-4 border-[var(--error)]/40 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--error-light)] text-[var(--error)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--error)]">Hapus Akun (Permanen)</h2>
            <p className="text-[var(--text-secondary)] text-sm">
              Menghapus akun akan menghapus: profil, post terjadwal, draf, media, koneksi social
              media, dan langganan. Konten yang sudah tayang di platform sosial{" "}
              <strong>tidak</strong> terpengaruh.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Ketik <strong>HAPUS</strong> untuk mengonfirmasi
          </Label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="HAPUS"
            className="max-w-[200px]"
          />
        </div>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting || confirmText !== "HAPUS"}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Hapus Akun Saya Selamanya
        </Button>
      </div>
    </div>
  );
}
