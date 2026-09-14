// Halaman Kompetitor — tracking & benchmark performa vs kompetitor
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Pencil, Plus, Swords, Trash2, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type CompetitorRow = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number;
  /** % x100 (basis point) */
  avgEngagementRateBp: number | null;
  postsPerWeek: number | null;
  isVerified: boolean;
  notes: string | null;
  engagementHistory: { date: string; followers: number; engagementRate: number }[];
  updatedAt: string;
  benchmarkScore: number;
};

type BenchmarkData = {
  org: { followers: number; engagementRate: number | null; postsPerWeek: number };
  aggregate: {
    count: number;
    avgFollowers: number;
    avgEngagementRateBp: number | null;
    avgPostsPerWeek: number | null;
  };
  competitors: CompetitorRow[];
  insight: string;
};

type FormData = {
  id?: string;
  platform: string;
  username: string;
  displayName: string;
  followers: string;
  avgEngagementRate: string;
  postsPerWeek: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  platform: "instagram",
  username: "",
  displayName: "",
  followers: "",
  avgEngagementRate: "",
  postsPerWeek: "",
  notes: "",
};

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID").format(n);
}

function platformLabel(platform: string): string {
  return PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform;
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function CompetitorForm({ initial, onDone }: { initial: FormData; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const isEdit = Boolean(form.id);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        platform: form.platform,
        username: form.username.trim(),
        followers: Number(form.followers) || 0,
      };
      if (form.displayName.trim()) payload.displayName = form.displayName.trim();
      if (form.avgEngagementRate) payload.avgEngagementRate = Number(form.avgEngagementRate);
      if (form.postsPerWeek) payload.postsPerWeek = Number(form.postsPerWeek);
      if (form.notes.trim()) payload.notes = form.notes.trim();
      return form.id
        ? api.patch(`/competitors/${form.id}`, payload)
        : api.post("/competitors", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success(isEdit ? "Kompetitor diperbarui" : "Kompetitor ditambahkan");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-semibold">{isEdit ? "Edit Kompetitor" : "Tambah Kompetitor"}</h3>
      <p className="text-[var(--text-muted)] text-xs">
        Isi data dari profil publik kompetitor — sistem otomatis membandingkannya dengan performa
        analytics Anda.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value })}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
        >
          {(
            [
              "instagram",
              "facebook",
              "tiktok",
              "youtube",
              "pinterest",
              "linkedin",
              "threads",
            ] as const
          ).map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </select>
        <Input
          placeholder="@username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <Input
          placeholder="Nama tampilan (opsional)"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <Input
          type="number"
          placeholder="Jumlah followers"
          value={form.followers}
          onChange={(e) => setForm({ ...form, followers: e.target.value })}
        />
        <Input
          type="number"
          step="0.1"
          placeholder="Engagement rate % (mis. 3.5)"
          value={form.avgEngagementRate}
          onChange={(e) => setForm({ ...form, avgEngagementRate: e.target.value })}
        />
        <Input
          type="number"
          placeholder="Post per minggu"
          value={form.postsPerWeek}
          onChange={(e) => setForm({ ...form, postsPerWeek: e.target.value })}
        />
      </div>
      <Input
        placeholder="Catatan (opsional — mis. jualan hijab, target pasar sama)"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      <div className="flex gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!form.username.trim() || !form.followers || save.isPending}
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isEdit ? "Simpan" : "Tambahkan"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
      </div>
    </div>
  );
}

export function CompetitorsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CompetitorRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["competitors"],
    queryFn: () => api.get<BenchmarkData>("/competitors"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/competitors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast.success("Kompetitor dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const competitors = data?.competitors ?? [];
  const agg = data?.aggregate;
  const org = data?.org;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Swords className="h-6 w-6 text-[var(--accent-gold)]" />
            Kompetitor
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Lacak kompetitor dan bandingkan performa Anda secara otomatis
          </p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setShowForm(!showForm);
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah Kompetitor
        </Button>
      </div>

      {showForm && <CompetitorForm initial={EMPTY_FORM} onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)]" />
      ) : competitors.length === 0 && !showForm ? (
        <EmptyState
          icon={<Swords className="h-6 w-6" />}
          title="Belum ada kompetitor"
          description="Tambahkan 3-5 kompetitor utama Anda untuk melihat benchmark followers, engagement rate, dan konsistensi posting."
        />
      ) : (
        <>
          {/* Stat ringkas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Kompetitor
              </p>
              <p className="mt-2 font-bold text-2xl">{agg?.count ?? 0}</p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Rata-rata Followers
              </p>
              <p className="mt-2 font-bold text-2xl">{formatNumber(agg?.avgFollowers)}</p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                Anda: {formatNumber(org?.followers)}
              </p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Rata-rata Eng. Rate
              </p>
              <p className="mt-2 font-bold text-2xl">
                {agg?.avgEngagementRateBp != null
                  ? `${(agg.avgEngagementRateBp / 100).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                Anda: {org?.engagementRate != null ? `${org.engagementRate.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Rata-rata Post/Minggu
              </p>
              <p className="mt-2 font-bold text-2xl">{agg?.avgPostsPerWeek ?? "—"}</p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                Anda: {org?.postsPerWeek ?? 0}
              </p>
            </div>
          </div>

          {/* Insight */}
          {data?.insight && (
            <div className="card flex items-start gap-3 border-[var(--accent-gold)]/40 bg-[var(--accent-gold-light)]/40 p-4">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
              <div>
                <p className="font-semibold text-[var(--accent-gold)] text-xs uppercase tracking-wide">
                  Insight Benchmark
                </p>
                <p className="mt-0.5 text-sm">{data.insight}</p>
              </div>
            </div>
          )}

          {/* Tabel kompetitor */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs uppercase tracking-wide">
                    <th className="px-5 py-3">Kompetitor</th>
                    <th className="px-5 py-3">Followers</th>
                    <th className="px-5 py-3">Eng. Rate</th>
                    <th className="px-5 py-3">Post/Mgg</th>
                    <th className="px-5 py-3">Skor</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((comp) => (
                    <>
                      <tr
                        key={comp.id}
                        className="cursor-pointer border-[var(--border-light)] border-b last:border-0 hover:bg-[var(--bg-tertiary)]/50"
                        onClick={() => setExpanded(expanded === comp.id ? null : comp.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={comp.displayName ?? comp.username}
                              src={comp.avatarUrl ?? undefined}
                              className="h-8 w-8 text-xs"
                            />
                            <div>
                              <div className="flex items-center gap-1 font-medium">
                                {comp.displayName ?? comp.username}
                                {comp.isVerified && (
                                  <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />
                                )}
                              </div>
                              <p className="text-[var(--text-muted)] text-xs">
                                @{comp.username} · {platformLabel(comp.platform)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-medium">{formatNumber(comp.followers)}</td>
                        <td className="px-5 py-3">
                          {comp.avgEngagementRateBp != null
                            ? `${(comp.avgEngagementRateBp / 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-5 py-3">{comp.postsPerWeek ?? "—"}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  scoreColor(comp.benchmarkScore),
                                )}
                                style={{ width: `${comp.benchmarkScore}%` }}
                              />
                            </div>
                            <span className="font-semibold text-xs">{comp.benchmarkScore}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditTarget(comp);
                                setShowForm(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                              title="Hapus"
                              onClick={(e) => {
                                e.stopPropagation();
                                remove.mutate(comp.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === comp.id && (
                        <tr key={`${comp.id}-detail`} className="bg-[var(--bg-tertiary)]/30">
                          <td colSpan={6} className="px-5 py-4">
                            {comp.notes && (
                              <p className="mb-3 text-sm">
                                <span className="font-medium">Catatan:</span> {comp.notes}
                              </p>
                            )}
                            {comp.engagementHistory.length > 1 ? (
                              <div>
                                <p className="mb-2 font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                                  Riwayat Followers
                                </p>
                                <div className="flex items-end gap-1">
                                  {comp.engagementHistory.map((snap) => {
                                    const max = Math.max(
                                      ...comp.engagementHistory.map((h) => h.followers),
                                    );
                                    const min = Math.min(
                                      ...comp.engagementHistory.map((h) => h.followers),
                                    );
                                    const range = Math.max(max - min, 1);
                                    const height = 20 + ((snap.followers - min) / range) * 40;
                                    return (
                                      <div
                                        key={snap.date}
                                        className="flex flex-col items-center gap-1"
                                      >
                                        <div
                                          className="w-6 rounded-t bg-[var(--accent-gold)]/70"
                                          style={{ height }}
                                          title={`${snap.date}: ${formatNumber(snap.followers)}`}
                                        />
                                        <span className="text-[9px] text-[var(--text-muted)]">
                                          {snap.date.slice(5)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[var(--text-muted)] text-xs">
                                Update data kompetitor ini beberapa kali untuk melihat tren riwayat.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit form di bawah saat mode edit */}
      {editTarget && showForm && (
        <CompetitorForm
          initial={{
            id: editTarget.id,
            platform: editTarget.platform,
            username: editTarget.username,
            displayName: editTarget.displayName ?? "",
            followers: String(editTarget.followers),
            avgEngagementRate:
              editTarget.avgEngagementRateBp != null
                ? (editTarget.avgEngagementRateBp / 100).toString()
                : "",
            postsPerWeek: editTarget.postsPerWeek != null ? String(editTarget.postsPerWeek) : "",
            notes: editTarget.notes ?? "",
          }}
          onDone={() => {
            setEditTarget(null);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}
