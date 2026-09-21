// Halaman Goal Tracker — target metric dengan progres dari data analytics riil.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flag, Loader2, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type GoalProgress = {
  id: string;
  name: string;
  metric: string;
  metricLabel: string;
  targetValue: number;
  baselineValue: number;
  startDate: string;
  endDate: string;
  currentValue: number;
  progressPercent: number;
  daysLeft: number;
  isCompleted: boolean;
};

const METRICS = [
  {
    value: "followers_growth",
    label: "Pertumbuhan Followers",
    hint: "Target tambahan follower baru",
  },
  { value: "followers", label: "Total Followers", hint: "Target jumlah follower akun utama" },
  { value: "engagement", label: "Total Engagement", hint: "Likes + komentar + share + save" },
  { value: "impressions", label: "Total Impressions", hint: "Berapa kali konten dilihat" },
  { value: "reach", label: "Jangkauan (Reach)", hint: "Berapa akun unik melihat konten" },
  { value: "posts_published", label: "Postingan Tayang", hint: "Jumlah konten tayang di periode" },
];

function formatNumber(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function GoalsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metric: "followers_growth",
    targetValue: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api.get<{ goals: GoalProgress[] }>("/goals"),
  });
  const goals = data?.goals ?? [];

  const createGoal = useMutation({
    mutationFn: () =>
      api.post("/goals", {
        name: form.name,
        metric: form.metric,
        targetValue: Number(form.targetValue),
        startDate: form.startDate,
        endDate: form.endDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      setModalOpen(false);
      setForm((f) => ({ ...f, name: "", targetValue: "" }));
      toast.success("Goal dibuat");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => api.delete(`/goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeGoals = goals.filter((g) => !g.isCompleted);
  const completedGoals = goals.filter((g) => g.isCompleted);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Target className="h-6 w-6 text-[var(--accent-gold)]" />
            Goal Tracker
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Tetapkan target & pantau progres — terhitung otomatis dari data analytics akun Anda
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Buat Goal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : goals.length === 0 ? (
        <div className="card p-12 text-center">
          <Flag className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <h2 className="mt-3 font-semibold">Belum ada goal</h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Mulai dengan target sederhana, mis. "Tambah 500 follower bulan ini". Progres terisi
            otomatis dari data analytics.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Goal Pertama
          </Button>
        </div>
      ) : (
        <>
          {/* Goal aktif */}
          <div className="grid gap-4 md:grid-cols-2">
            {activeGoals.map((g) => (
              <div key={g.id} className="card space-y-3 p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{g.name}</h3>
                    <p className="text-[var(--text-muted)] text-xs">
                      {g.metricLabel} · {formatDate(g.startDate)} – {formatDate(g.endDate)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteGoal.mutate(g.id)}
                    className="shrink-0 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-red-500"
                    aria-label="Hapus goal"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-bold text-2xl">{formatNumber(g.currentValue)}</span>
                    <span className="text-[var(--text-muted)] text-sm">
                      {" "}
                      / {formatNumber(g.targetValue)}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px]", g.daysLeft === 0 && "text-red-500")}
                  >
                    {g.daysLeft === 0 ? "Periode berakhir" : `${g.daysLeft} hari lagi`}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        g.progressPercent >= 100
                          ? "bg-emerald-500"
                          : g.progressPercent >= 60
                            ? "bg-emerald-400"
                            : g.progressPercent >= 30
                              ? "bg-[var(--accent-gold)]"
                              : "bg-amber-400",
                      )}
                      style={{ width: `${Math.min(100, g.progressPercent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {g.progressPercent}% tercapai
                    </span>
                    {g.baselineValue > 0 && (
                      <span className="text-[var(--text-muted)]">
                        mulai dari {formatNumber(g.baselineValue)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Goal selesai */}
          {completedGoals.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-[var(--text-secondary)] text-sm">
                Goal Tercapai ({completedGoals.length})
              </h2>
              <div className="space-y-2">
                {completedGoals.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium text-sm">{g.name}</span>
                      <span className="text-[var(--text-muted)] text-xs">
                        {formatNumber(g.currentValue)} / {formatNumber(g.targetValue)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteGoal.mutate(g.id)}
                      className="rounded p-1 text-[var(--text-muted)] hover:text-red-500"
                      aria-label="Hapus goal selesai"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal buat goal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Buat Goal Baru">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(form.targetValue) < 1) {
              toast.error("Target minimal 1");
              return;
            }
            createGoal.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nama Goal</Label>
            <Input
              id="goal-name"
              placeholder="mis. Tambah 500 follower bulan ini"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Metric</Label>
            <div className="space-y-1.5">
              {METRICS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, metric: m.value }))}
                  className={`w-full rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm ${
                    form.metric === m.value
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                      : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                  }`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-[var(--text-muted)] text-xs">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input
                id="goal-target"
                type="number"
                min={1}
                placeholder="500"
                value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Mulai</Label>
              <Input
                id="goal-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-end">Selesai</Label>
              <Input
                id="goal-end"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                required
              />
            </div>
          </div>

          <p className="text-[var(--text-muted)] text-xs">
            Nilai awal (baseline) di-snapshot otomatis dari data analytics saat goal dibuat. Progres
            diperbarui setiap sinkronisasi analytics.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createGoal.isPending}>
              {createGoal.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Buat Goal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
