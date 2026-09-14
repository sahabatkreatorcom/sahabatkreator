// Admin: Pengguna — list, set role, ban/unban, impersonate (masuk sebagai user),
// cabut sesi (logout paksa semua device user)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  VenetianMask,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
};

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [impersonateTarget, setImpersonateTarget] = useState<User | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page],
    queryFn: () =>
      api.get<{ users: User[]; total: number; page: number; perPage: number }>(
        `/admin/users?page=${page}`,
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const patchUser = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      api.patch(`/admin/users/${id}`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("User diperbarui");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Impersonate: buat session sbg user target → redirect ke /dashboard.
  // Banner merah akan muncul di dashboard utk keluar dari impersonasi.
  const impersonate = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ ok: boolean; targetUser: { id: string; name: string; email: string } }>(
        `/admin/users/${userId}/impersonate`,
      ),
    onSuccess: (data) => {
      toast.success(`Masuk sebagai ${data.targetUser.name} (${data.targetUser.email})`);
      // Hard reload agar seluruh cache query (session user) ter-reset
      window.location.href = "/dashboard";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Cabut sesi: logout paksa user target dari semua device.
  const revokeSessions = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ success: boolean }>(`/admin/users/${userId}/revoke-sessions`),
    onSuccess: () => {
      toast.success("Semua sesi user berhasil dicabut");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 20;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Pengguna</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">{total} pengguna terdaftar</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
              <th className="px-5 py-3 font-medium">Pengguna</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">2FA</th>
              <th className="px-5 py-3 font-medium">Bergabung</th>
              <th className="px-5 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-[var(--bg-secondary)]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} src={user.image ?? undefined} className="h-9 w-9" />
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-[var(--text-muted)] text-xs">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={user.role === "admin" ? "primary" : "secondary"}>
                    {user.role}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {user.banned ? (
                    <Badge variant="destructive">Diblokir</Badge>
                  ) : (
                    <Badge variant="success">Aktif</Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                  {user.twoFactorEnabled ? "Aktif" : "—"}
                </td>
                <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    {user.banned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patchUser.mutate({ id: user.id, ban: false })}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Unban
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => {
                          setBanTarget(user);
                          setBanReason("");
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Ban
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Masuk sebagai user ini untuk debugging"
                      aria-label="Masuk sebagai user ini"
                      disabled={user.role === "admin" || impersonate.isPending}
                      onClick={() => setImpersonateTarget(user)}
                    >
                      {impersonate.isPending && impersonateTarget?.id === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <VenetianMask className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Cabut semua sesi login user ini"
                      aria-label="Cabut semua sesi login user ini"
                      disabled={revokeSessions.isPending}
                      onClick={() => setRevokeTarget(user)}
                    >
                      {revokeSessions.isPending && revokeSessions.variables === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        patchUser.mutate({
                          id: user.id,
                          role: user.role === "admin" ? "user" : "admin",
                        })
                      }
                    >
                      {patchUser.isPending && patchUser.variables?.id === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : user.role === "admin" ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {user.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginasi */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            Sebelumnya
          </Button>
          <span className="text-[var(--text-muted)] text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Berikutnya
          </Button>
        </div>
      )}

      {/* Modal ban */}
      {banTarget && (
        <Modal open onClose={() => setBanTarget(null)} title={`Blokir ${banTarget.name}?`}>
          <div className="space-y-4">
            <p className="text-[var(--text-secondary)] text-sm">
              User yang diblokir tidak bisa login sampai di-unban.
            </p>
            <div>
              <label className="mb-2 block font-medium text-sm" htmlFor="ban-reason">
                Alasan (opsional)
              </label>
              <input
                id="ban-reason"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                placeholder="mis. Pelanggaran Syarat & Ketentuan"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setBanTarget(null)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  patchUser.mutate({ id: banTarget.id, ban: true, banReason });
                  setBanTarget(null);
                }}
              >
                <Ban className="h-4 w-4" />
                Blokir
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal konfirmasi impersonate */}
      {impersonateTarget && (
        <Modal
          open
          onClose={() => setImpersonateTarget(null)}
          title={`Masuk sebagai ${impersonateTarget.name}?`}
        >
          <div className="space-y-4">
            <p className="text-[var(--text-secondary)] text-sm">
              Anda akan bertindak sebagai{" "}
              <span className="font-medium">{impersonateTarget.email}</span> untuk keperluan
              debugging. Semua aksi yang Anda lakukan akan tercatat di log aktivitas. Gunakan tombol{" "}
              <span className="font-medium">"Keluar"</span> di banner merah untuk kembali ke akun
              admin.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImpersonateTarget(null)}>
                Batal
              </Button>
              <Button
                onClick={() => {
                  impersonate.mutate(impersonateTarget.id);
                  setImpersonateTarget(null);
                }}
                disabled={impersonate.isPending}
              >
                {impersonate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <VenetianMask className="h-4 w-4" />
                )}
                Masuk sebagai User
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {/* Modal konfirmasi cabut sesi */}
      {revokeTarget && (
        <Modal
          open
          onClose={() => setRevokeTarget(null)}
          title={`Cabut semua sesi ${revokeTarget.name}?`}
        >
          <div className="space-y-4">
            <p className="text-[var(--text-secondary)] text-sm">
              User akan dikeluarkan paksa dari semua perangkat dan harus login ulang. Cocok untuk
              keamanan bila akun dicurigai disusupi.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                disabled={revokeSessions.isPending}
                onClick={() => {
                  revokeSessions.mutate(revokeTarget.id);
                  setRevokeTarget(null);
                }}
              >
                {revokeSessions.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Cabut Sesi
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
