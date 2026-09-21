// Section custom role & matrix permission di halaman Tim
// (adaptasi reference team/permissions — disesuaikan domain SK).

import {
  BUILT_IN_ROLE_PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  type PermissionCode,
} from "@sahabatkreator/db/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";

export type CustomRole = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  permissions: string[];
  memberCount: number;
  createdAt: string;
};

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#ef4444", // red
  "#64748b", // slate
];

export function CustomRolesSection({ canManage, orgId }: { canManage: boolean; orgId?: string }) {
  const queryClient = useQueryClient();
  const [editRole, setEditRole] = useState<CustomRole | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team-roles", orgId],
    queryFn: () => api.get<{ roles: CustomRole[] }>("/team/roles"),
    enabled: canManage && !!orgId,
  });

  const removeRole = useMutation({
    mutationFn: (roleId: string) => api.delete(`/team/roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-roles"] });
      queryClient.invalidateQueries({ queryKey: ["team-assignments"] });
      toast.success("Role dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roles = data?.roles ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Custom Role</h2>
          <p className="text-[var(--text-secondary)] text-sm">
            Role tambahan dengan permission granular untuk anggota tim
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Role Baru
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-6 text-center text-[var(--text-muted)] text-sm">Memuat role…</div>
      ) : roles.length === 0 ? (
        <div className="card p-6 text-center text-[var(--text-muted)] text-sm">
          Belum ada custom role. Buat role untuk memberi akses granular, mis. "Content Writer"
          (hanya buat draft) atau "Analyst" (hanya lihat analitik).
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <div key={role.id} className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                    <p className="truncate font-medium">{role.name}</p>
                  </div>
                  {role.description && (
                    <p className="mt-1 line-clamp-2 text-[var(--text-muted)] text-xs">
                      {role.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Edit role"
                      onClick={() => setEditRole(role)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500"
                      title="Hapus role"
                      disabled={removeRole.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Hapus role "${role.name}"? Member dengan role ini akan kembali ke permission role built-in.`,
                          )
                        ) {
                          removeRole.mutate(role.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[var(--text-muted)] text-xs">
                <Badge variant="secondary">{role.memberCount} anggota</Badge>
                <span>·</span>
                <span>{role.permissions.length} permission</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {(createOpen || editRole) && (
        <RoleEditorModal
          role={editRole}
          onClose={(saved) => {
            setCreateOpen(false);
            setEditRole(null);
            if (saved) {
              queryClient.invalidateQueries({ queryKey: ["team-roles"] });
            }
          }}
        />
      )}
    </div>
  );
}

/** Modal buat/edit custom role dengan matrix permission per kategori */
function RoleEditorModal({
  role,
  onClose,
}: {
  role: CustomRole | null;
  onClose: (saved: boolean) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#6366f1");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const togglePermission = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleCategory = (codes: string[], allSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (allSelected) next.delete(code);
        else next.add(code);
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        permissions: [...selected],
      };
      if (role) {
        return api.patch(`/team/roles/${role.id}`, payload);
      }
      return api.post("/team/roles", payload);
    },
    onSuccess: () => {
      toast.success(role ? "Role diperbarui" : "Role dibuat");
      onClose(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title={role ? `Edit Role: ${role.name}` : "Role Baru"}
      size="lg"
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">Nama Role</Label>
            <Input
              id="role-name"
              placeholder="mis. Content Writer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Warna Badge</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? "scale-110 border-[var(--text-primary)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="role-desc">Deskripsi (opsional)</Label>
          <Input
            id="role-desc"
            placeholder="Untuk apa role ini?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Permission</Label>
            <button
              type="button"
              className="text-[var(--accent-gold)] text-xs hover:underline"
              onClick={() =>
                setSelected(
                  selected.size === BUILT_IN_ROLE_PERMISSIONS.admin.length
                    ? new Set()
                    : new Set(BUILT_IN_ROLE_PERMISSIONS.member),
                )
              }
            >
              {selected.size === BUILT_IN_ROLE_PERMISSIONS.admin.length
                ? "Kosongkan"
                : "Pilih dasar (anggota)"}
            </button>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            {PERMISSION_CATEGORIES.map((cat) => {
              const allSelected = cat.permissions.every((p) => selected.has(p));
              return (
                <div key={cat.key} className="space-y-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left font-medium text-sm"
                    onClick={() => toggleCategory(cat.permissions, allSelected)}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${
                        allSelected
                          ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {allSelected && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-black" aria-hidden="true">
                          <path
                            d="M2.5 6.5l2.5 2.5 4.5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    {cat.label}
                  </button>
                  <div className="ml-6 grid gap-1.5 sm:grid-cols-2">
                    {cat.permissions.map((code) => (
                      <label
                        key={code}
                        className="flex cursor-pointer items-center gap-2 text-[var(--text-secondary)] text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(code)}
                          onChange={() => togglePermission(code)}
                          className="h-3.5 w-3.5 accent-[var(--accent-gold)]"
                        />
                        {labelFor(code)}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onClose(false)}>
            Batal
          </Button>
          <Button type="submit" disabled={save.isPending || name.trim().length < 2}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Shield className="h-4 w-4" />
            {role ? "Simpan Perubahan" : "Buat Role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const CODE_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.code, p.label]),
);

function labelFor(code: PermissionCode): string {
  return CODE_LABELS[code] ?? code;
}
