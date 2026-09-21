// Panel link laporan publik (Shareable Report, M10b).
// Tombol "Bagikan" → modal (judul + rentang 7/30/90 hari) → URL publik /r/<token>
// + tombol copy, dan daftar link aktif dengan tombol hapus (revoke).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type ReportShare = {
  id: string;
  token: string;
  title: string;
  days: number;
  accountId: string | null;
  createdAt: string;
  expiresAt: string;
};

const RANGE_OPTIONS = [
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
] as const;

function shareUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

export function ShareReportPanel() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [copied, setCopied] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["report-shares"],
    queryFn: () => api.get<{ shares: ReportShare[] }>("/reports/share"),
  });
  const shares = data?.shares ?? [];

  const createShare = useMutation({
    mutationFn: () => api.post<{ share: ReportShare }>("/reports/share", { title, days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-shares"] });
      setModalOpen(false);
      setTitle("");
      toast.success("Link laporan dibuat — siap dibagikan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteShare = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/share/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-shares"] });
      toast.success("Link laporan dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Link disalin ke clipboard");
    } catch {
      toast.error("Gagal menyalin link — salin manual dari teks");
    }
  }

  return (
    <div className="card space-y-4 p-6 print:hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Share2 className="h-4 w-4 text-[var(--accent-gold)]" />
            Link Laporan Publik
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-xs">
            Bagikan ringkasan performa via link read-only — berlaku 30 hari, bisa dicabut kapan saja
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Bagikan
        </Button>
      </div>

      {shares.length === 0 ? (
        <p className="text-[var(--text-secondary)] text-sm">
          Belum ada link aktif. Buat link untuk membagikan laporan ke klien atau tim.
        </p>
      ) : (
        <div className="space-y-2">
          {shares.map((s) => {
            const expired = new Date(s.expiresAt) < new Date();
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Link2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{s.title}</p>
                    <p className="truncate text-[var(--text-muted)] text-xs">
                      {s.days} hari · kedaluwarsa {formatDate(s.expiresAt.slice(0, 10))}
                      {expired && " · kedaluwarsa"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={shareUrl(s.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[180px] truncate rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)]"
                    title={shareUrl(s.token)}
                  >
                    /r/{s.token}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(s.token)}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    aria-label="Salin link"
                  >
                    {copied === s.token ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteShare.mutate(s.id)}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:text-red-500"
                    aria-label="Hapus link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal buat link */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Bagikan Laporan"
        description="Buat link publik read-only untuk ringkasan performa"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createShare.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="share-title">Judul Laporan</Label>
            <Input
              id="share-title"
              placeholder="Laporan Performa Desember"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Rentang Data</Label>
            <div className="grid grid-cols-3 gap-2">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDays(opt.value)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                    days === opt.value
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[var(--text-muted)] text-xs">
            Link menampilkan ringkasan read-only (followers, engagement, jangkauan) tanpa data
            sensitif. Berlaku 30 hari.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createShare.isPending || !title.trim()}>
              {createShare.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Buat Link
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
