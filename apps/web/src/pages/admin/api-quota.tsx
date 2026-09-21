// Admin: Kuota API — snapshot rate-limit per entity (auto dari response header platform)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";

type Quota = {
  id: string;
  platform: string;
  entity_id: string;
  quota_type: string;
  remaining: number;
  total: number;
  date: string;
  synced_at: string;
};

type TrendRow = {
  date: string;
  platform: string;
  quotaType: string;
  usedPct: number;
};

function quotaColor(remaining: number, total: number): string {
  if (total <= 0) return "bg-[var(--bg-tertiary)]";
  const pct = remaining / total;
  if (pct <= 0.2) return "bg-red-500";
  if (pct <= 0.5) return "bg-amber-500";
  return "bg-emerald-500";
}

export function AdminApiQuotaPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-api-quotas"],
    queryFn: () => api.get<{ quotas: Quota[]; trend: TrendRow[] }>("/admin/api-access/quotas"),
  });

  if (isLoading) return <PageLoader />;

  const quotas = data?.quotas ?? [];
  const trend = data?.trend ?? [];
  const platformEntries = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

  // Tren terbaru per (platform, quotaType)
  const latestTrendByPlatform = new Map<string, TrendRow[]>();
  for (const row of trend) {
    const key = `${row.platform}:${row.quotaType}`;
    const list = latestTrendByPlatform.get(key) ?? [];
    list.push(row);
    latestTrendByPlatform.set(key, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Kuota API</h1>
          <p className="mt-1 max-w-2xl text-[var(--text-secondary)] text-sm">
            Snapshot rate-limit per entity per hari. Terisi otomatis dari response header platform
            saat publish (mis. Meta Business Use Case) — input manual hanya untuk koreksi.
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Input Manual
        </Button>
      </div>

      {quotas.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] border-dashed p-10 text-center">
          <Gauge className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <p className="mt-3 text-[var(--text-secondary)] text-sm">
            Belum ada snapshot kuota. Data muncul otomatis saat publish via platform mulai berjalan
            (header rate-limit direkam worker).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotas.map((q) => {
            const pct = q.total > 0 ? Math.round((q.remaining / q.total) * 100) : 0;
            const trendKey = `${q.platform}:${q.quota_type}`;
            const trendRows = (latestTrendByPlatform.get(trendKey) ?? []).slice(0, 7).reverse();
            return (
              <div
                key={q.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {PLATFORMS[q.platform as keyof typeof PLATFORMS]?.icon &&
                        PLATFORMS[q.platform as keyof typeof PLATFORMS].icon({
                          className: "h-4 w-4",
                        })}
                      {q.quota_type}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[var(--text-muted)] text-xs">
                      {q.entity_id}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="font-semibold">{q.remaining}</span>
                    <span className="text-[var(--text-muted)]"> / {q.total} tersisa</span>
                    <p className="text-[var(--text-muted)] text-xs">
                      {new Date(q.synced_at).toLocaleString("id-ID")} WIB
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className={`h-full rounded-full transition-all ${quotaColor(q.remaining, q.total)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {trendRows.length > 1 && (
                    <div className="mt-2 flex items-center gap-1 text-[var(--text-muted)] text-xs">
                      <span>Pemakaian 7 hari:</span>
                      {trendRows.map((t) => (
                        <span
                          key={t.date}
                          title={`${t.date}: ${t.usedPct}% terpakai`}
                          className={`rounded px-1.5 py-0.5 font-medium ${
                            t.usedPct >= 80
                              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                              : "bg-[var(--bg-tertiary)]"
                          }`}
                        >
                          {t.usedPct}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <QuotaFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        platformEntries={platformEntries}
      />
    </div>
  );
}

function QuotaFormModal({
  open,
  onClose,
  platformEntries,
}: {
  open: boolean;
  onClose: () => void;
  platformEntries: [string, { label: string }][];
}) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState("instagram");
  const [entityId, setEntityId] = useState("");
  const [quotaType, setQuotaType] = useState("meta_buc");
  const [remaining, setRemaining] = useState("");
  const [total, setTotal] = useState("200");

  const create = useMutation({
    mutationFn: () =>
      api.post("/admin/api-access/quotas", {
        platform,
        entityId,
        quotaType,
        remaining: Number(remaining),
        total: Number(total),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-quotas"] });
      toast.success("Snapshot kuota tersimpan");
      setEntityId("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Input Snapshot Kuota" size="default">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="q-platform">Platform</Label>
            <select
              id="q-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 text-sm"
            >
              {platformEntries.map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-type">Jenis kuota</Label>
            <Input
              id="q-type"
              value={quotaType}
              onChange={(e) => setQuotaType(e.target.value)}
              placeholder="meta_buc / rate_limit"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-entity">Entity ID (app ID / page ID / akun)</Label>
          <Input
            id="q-entity"
            required
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="mis. 1234567890"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="q-remaining">Remaining</Label>
            <Input
              id="q-remaining"
              type="number"
              required
              min={0}
              value={remaining}
              onChange={(e) => setRemaining(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-total">Total</Label>
            <Input
              id="q-total"
              type="number"
              required
              min={1}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
