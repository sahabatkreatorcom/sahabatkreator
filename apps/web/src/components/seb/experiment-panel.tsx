// Panel experiment SEB — daftar + form tambah + update status
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, PlayCircle, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { EXPERIMENT_STATUS_LABELS, type SebExperiment } from "./types";

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function ExperimentPanel({ experiments }: { experiments: SebExperiment[] }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [platform, setPlatform] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["seb-overview"] });
    queryClient.invalidateQueries({ queryKey: ["seb-experiments"] });
  };

  const createExperiment = useMutation({
    mutationFn: () =>
      api.post<{ experiment: SebExperiment }>("/seb/experiments", {
        title: title.trim(),
        hypothesis: hypothesis.trim(),
        platform: platform || null,
      }),
    onSuccess: () => {
      toast.success("Experiment dibuat");
      setTitle("");
      setHypothesis("");
      setPlatform("");
      setShowForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/seb/experiments/${id}`, { status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/seb/experiments/${id}`),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = title.trim().length > 0 && hypothesis.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <FlaskConical className="h-5 w-5 text-[var(--accent-gold)]" />
          Experiment
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Batal" : "+ Experiment"}
        </Button>
      </div>

      {showForm && (
        <div className="card space-y-3 p-4">
          <div>
            <label htmlFor="exp-title" className="font-medium text-[var(--text-secondary)] text-xs">
              Judul
            </label>
            <input
              id="exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="mis. Hook 3 detik di video pertama"
              className="input mt-1 w-full"
            />
          </div>
          <div>
            <label
              htmlFor="exp-hypothesis"
              className="font-medium text-[var(--text-secondary)] text-xs"
            >
              Hipotesis
            </label>
            <textarea
              id="exp-hypothesis"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="mis. Jika hook dibuat ≤3 detik, watch time naik ≥15%"
              className="input mt-1 w-full resize-none"
            />
          </div>
          <div>
            <label
              htmlFor="exp-platform"
              className="font-medium text-[var(--text-secondary)] text-xs"
            >
              Platform
            </label>
            <select
              id="exp-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="input mt-1 w-full"
            >
              <option value="">Semua platform</option>
              {Object.entries(PLATFORMS)
                .filter(([key]) => key !== "manual")
                .map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={!canSubmit || createExperiment.isPending}
            onClick={() => createExperiment.mutate()}
          >
            {createExperiment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      )}

      {experiments.length === 0 ? (
        <p className="text-[var(--text-secondary)] text-sm">
          Belum ada experiment. SEB juga menyarankan experiment lewat report harian.
        </p>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <div key={exp.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-semibold text-[11px]",
                    STATUS_STYLES[exp.status] ?? STATUS_STYLES.planned,
                  )}
                >
                  {EXPERIMENT_STATUS_LABELS[exp.status] ?? exp.status}
                </span>
                {exp.platform && (
                  <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                    {PLATFORMS[exp.platform as keyof typeof PLATFORMS]?.label ?? exp.platform}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(exp.id)}
                  disabled={remove.isPending}
                  className="ml-auto rounded p-1 text-[var(--text-muted)] transition-colors hover:text-red-600"
                  aria-label="Hapus experiment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 font-medium">{exp.title}</p>
              <p className="mt-1 text-[var(--text-secondary)] text-sm">{exp.hypothesis}</p>
              <div className="mt-3 flex items-center gap-2">
                {exp.status !== "running" && exp.status !== "completed" && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: exp.id, status: "running" })}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 font-medium text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    Mulai
                  </button>
                )}
                {exp.status === "running" && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: exp.id, status: "completed" })}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-emerald-300 px-2.5 py-1 font-medium text-emerald-700 text-xs transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Selesaikan
                  </button>
                )}
                {exp.status !== "cancelled" && exp.status !== "completed" && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: exp.id, status: "cancelled" })}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 font-medium text-[var(--text-secondary)] text-xs transition-colors hover:text-[var(--text-primary)]"
                  >
                    Batalkan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
