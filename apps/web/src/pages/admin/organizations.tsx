// Admin: Organisasi — list org + set tier manual
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Org = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: string;
  tier: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
};

const TIERS = ["free", "pro", "business", "enterprise"] as const;

export function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tierTarget, setTierTarget] = useState<Org | null>(null);
  const [tier, setTier] = useState<string>("free");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", page],
    queryFn: () =>
      api.get<{ organizations: Org[]; total: number; page: number; perPage: number }>(
        `/admin/organizations?page=${page}`,
      ),
  });

  const setOrgTier = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) =>
      api.patch(`/admin/organizations/${id}`, { tier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
      setTierTarget(null);
      toast.success("Tier organisasi diperbarui");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const orgs = data?.organizations ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 20;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Organisasi</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">{total} organisasi terdaftar</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
              <th className="px-5 py-3 font-medium">Organisasi</th>
              <th className="px-5 py-3 font-medium">Paket</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Anggota</th>
              <th className="px-5 py-3 font-medium">Dibuat</th>
              <th className="px-5 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-[var(--bg-secondary)]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={org.name} src={org.logo ?? undefined} className="h-9 w-9" />
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-[var(--text-muted)] text-xs">{org.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={org.tier === "free" ? "secondary" : "primary"}>
                    {org.tier ?? "free"}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                  {org.subscriptionStatus ?? "—"}
                </td>
                <td className="px-5 py-3">{org.memberCount}</td>
                <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                  {formatDate(org.createdAt)}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTierTarget(org);
                      setTier(org.tier ?? "free");
                    }}
                  >
                    Set Tier
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

      {/* Modal set tier */}
      {tierTarget && (
        <Modal open onClose={() => setTierTarget(null)} title={`Set Tier — ${tierTarget.name}`}>
          <div className="space-y-4">
            <p className="text-[var(--text-secondary)] text-sm">
              Override manual akan mengabaikan hasil pembayaran untuk org ini.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2.5 text-sm capitalize ${
                    tier === t
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTierTarget(null)}>
                Batal
              </Button>
              <Button
                onClick={() => setOrgTier.mutate({ id: tierTarget.id, tier })}
                disabled={setOrgTier.isPending}
              >
                {setOrgTier.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
