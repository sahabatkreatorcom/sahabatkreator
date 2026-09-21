// Halaman Tim — anggota organisasi + undang via email + custom role
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Shield, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type CustomRole, CustomRolesSection } from "@/components/team/custom-roles-section";
import {
  type Assignment,
  RoleAssignSelect,
  useCustomRoles,
  useRoleAssignments,
} from "@/components/team/role-assign-select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { meQueryOptions } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { formatDate, initials } from "@/lib/format";

type Member = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: { name: string; email: string; image: string | null };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Anggota",
};

const ROLE_COLORS: Record<string, "primary" | "secondary" | "destructive"> = {
  owner: "primary",
  admin: "secondary",
  member: "secondary",
};

export function TeamPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQueryOptions);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // RequireAuth menjamin user punya org saat halaman dashboard render
  const org = me?.organization;
  const isOwnerOrAdmin = org?.role === "owner" || org?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["org-members", org?.id],
    queryFn: async () => {
      const res = await authClient.organization.listMembers();
      if (res.error) throw new Error(res.error.message ?? "Gagal memuat anggota");
      return res.data;
    },
    enabled: !!org?.id,
  });

  const { data: invitesData } = useQuery({
    queryKey: ["org-invitations"],
    queryFn: async () => {
      const res = await authClient.organization.listInvitations();
      if (res.error) throw new Error(res.error.message ?? "Gagal memuat undangan");
      return res.data;
    },
    enabled: isOwnerOrAdmin,
  });

  const invite = useMutation({
    mutationFn: () =>
      authClient.organization.inviteMember({
        email: inviteEmail,
        role: inviteRole as "member" | "admin",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-invitations"] });
      setInviteModal(false);
      setInviteEmail("");
      toast.success(`Undangan dikirim ke ${inviteEmail}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      authClient.organization.removeMember({ memberIdOrEmail: memberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Anggota dikeluarkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) =>
      authClient.organization.cancelInvitation({ invitationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-invitations"] });
      toast.success("Undangan dibatalkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Custom role & assignment — hanya dimuat untuk owner/admin
  const { data: rolesData } = useCustomRoles(org?.id, isOwnerOrAdmin);
  const { data: assignmentsData } = useRoleAssignments(org?.id, isOwnerOrAdmin);
  const customRoles: CustomRole[] = rolesData?.roles ?? [];
  const roleAssignments: Assignment[] = assignmentsData?.assignments ?? [];

  if (isLoading) return <PageLoader />;

  const members = (data ?? []) as unknown as Member[];
  const invitations = ((invitesData ?? []) as unknown as Invitation[]).filter(
    (i) => i.status === "pending",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Tim</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            {members.length} anggota di {org?.name}
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Button onClick={() => setInviteModal(true)}>
            <UserPlus className="h-4 w-4" />
            Undang Anggota
          </Button>
        )}
      </div>

      {/* Anggota */}
      {members.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Belum ada anggota" />
      ) : (
        <div className="card divide-y divide-[var(--border-light)] p-0">
          {members.map((member) => {
            const customAssignment = roleAssignments.find((a) => a.memberId === member.id);
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 p-5 sm:gap-4">
                <Avatar
                  name={member.user.name}
                  src={member.user.image ?? undefined}
                  className="h-10 w-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.user.name}</p>
                  <p className="truncate text-[var(--text-muted)] text-sm">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={ROLE_COLORS[member.role] ?? "secondary"}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </Badge>
                  {customAssignment && (
                    <Badge
                      variant="secondary"
                      className="border"
                      style={{ borderColor: customAssignment.roleColor }}
                    >
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: customAssignment.roleColor }}
                      />
                      {customAssignment.roleName}
                    </Badge>
                  )}
                </div>
                {isOwnerOrAdmin && member.role !== "owner" && customRoles.length > 0 && (
                  <RoleAssignSelect
                    memberId={member.id}
                    assignments={roleAssignments}
                    roles={customRoles}
                    orgId={org?.id}
                  />
                )}
                <span className="hidden text-[var(--text-muted)] text-xs sm:block">
                  Bergabung {formatDate(member.createdAt)}
                </span>
                {isOwnerOrAdmin && member.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500"
                    onClick={() => removeMember.mutate(member.id)}
                    disabled={removeMember.isPending}
                  >
                    Keluarkan
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Custom role & matrix permission */}
      {isOwnerOrAdmin && <CustomRolesSection canManage={isOwnerOrAdmin} orgId={org?.id} />}

      {/* Undangan pending */}
      {isOwnerOrAdmin && invitations.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Undangan Menunggu</h2>
          <div className="card divide-y divide-[var(--border-light)] p-0">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                  <Mail className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{inv.email}</p>
                  <p className="text-[var(--text-muted)] text-xs">
                    {ROLE_LABELS[inv.role] ?? inv.role} · kedaluwarsa {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500"
                  onClick={() => revokeInvite.mutate(inv.id)}
                >
                  Batalkan
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal undang */}
      {inviteModal && (
        <Modal open onClose={() => setInviteModal(false)} title="Undang Anggota Baru">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="rekan@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["member", "admin"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm ${
                      inviteRole === role
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setInviteModal(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={invite.isPending || !inviteEmail.trim()}>
                {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Kirim Undangan
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
