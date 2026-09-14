// Dropdown assign custom role ke member tim
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CustomRole } from "./custom-roles-section";

export type Assignment = {
  memberId: string;
  roleId: string;
  roleName: string;
  roleColor: string;
};

/** Dropdown pilih custom role untuk satu member (null = tanpa custom role) */
export function RoleAssignSelect({
  memberId,
  assignments,
  roles,
  disabled,
  orgId,
}: {
  memberId: string;
  assignments: Assignment[];
  roles: CustomRole[];
  disabled?: boolean;
  orgId?: string;
}) {
  const queryClient = useQueryClient();
  const current = assignments.find((a) => a.memberId === memberId);

  const assign = useMutation({
    mutationFn: (roleId: string | null) => api.put("/team/assignments", { memberId, roleId }),
    onSuccess: (_d, roleId) => {
      queryClient.invalidateQueries({ queryKey: ["team-assignments", orgId] });
      queryClient.invalidateQueries({ queryKey: ["team-roles", orgId] });
      toast.success(roleId ? "Custom role diperbarui" : "Custom role dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roles.length === 0 && !current) return null;

  return (
    <div className="flex items-center gap-1.5">
      {assign.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <select
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)] disabled:opacity-50"
        value={current?.roleId ?? ""}
        disabled={disabled || assign.isPending}
        onChange={(e) => assign.mutate(e.target.value || null)}
      >
        <option value="">Tanpa custom role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Hook assignment org aktif — dipakai halaman Tim */
export function useRoleAssignments(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["team-assignments", orgId],
    queryFn: () => api.get<{ assignments: Assignment[] }>("/team/assignments"),
    enabled: enabled && !!orgId,
  });
}

/** Hook daftar custom role org aktif */
export function useCustomRoles(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["team-roles", orgId],
    queryFn: () => api.get<{ roles: CustomRole[] }>("/team/roles"),
    enabled: enabled && !!orgId,
  });
}
