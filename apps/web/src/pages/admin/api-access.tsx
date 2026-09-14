// Admin: Pengajuan API — tracking review app per platform + permission
// Mendukung playbook docs/social-platforms/app-review-playbook.md
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";

export type ReviewStatus =
  | "not_started"
  | "preparing"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type AppReview = {
  id: string;
  platform: string;
  submissionId: string | null;
  permissionScope: string | null;
  title: string;
  description: string | null;
  status: ReviewStatus;
  dashboardUrl: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  deadlineAt: string | null;
  rejectionReason: string | null;
  checklist: Partial<Record<ChecklistKey, boolean>> | null;
  notes: Record<string, unknown> | null;
  statusHistory: { status: ReviewStatus; at: string; note?: string }[] | null;
  updatedAt: string;
};

export type ChecklistKey =
  | "privacy_policy"
  | "privacy_policy_en"
  | "terms_of_service"
  | "terms_of_service_en"
  | "data_deletion"
  | "data_deletion_callback"
  | "screencast"
  | "app_icon_1024"
  | "business_verification"
  | "demo_credentials"
  | "legal_docs"
  | "url_verification"
  | "webhook_endpoint"
  | "token_revocation"
  | "linkedin_company_page"
  | "youtube_quota_form";

const STATUS_META: Record<ReviewStatus, { label: string; className: string }> = {
  not_started: {
    label: "Belum mulai",
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  },
  preparing: {
    label: "Persiapan",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  submitted: {
    label: "Terkirim",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  in_review: {
    label: "Ditinjau",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  approved: {
    label: "Disetujui",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: {
    label: "Ditolak",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  withdrawn: {
    label: "Ditarik",
    className: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  privacy_policy: "Privacy Policy URL (ID)",
  privacy_policy_en: "Privacy Policy URL (EN)",
  terms_of_service: "Terms of Service URL (ID)",
  terms_of_service_en: "Terms of Service URL (EN)",
  data_deletion: "Data Deletion Policy",
  data_deletion_callback: "Data Deletion Callback Endpoint",
  screencast: "Video screencast 1080p",
  app_icon_1024: "App Icon 1024×1024",
  business_verification: "Business Verification",
  demo_credentials: "Akun demo reviewer",
  legal_docs: "Dokumen legal organisasi",
  url_verification: "URL Verification (TikTok)",
  webhook_endpoint: "Webhook Endpoint",
  token_revocation: "Token Revocation Endpoint",
  linkedin_company_page: "LinkedIn Company Page",
  youtube_quota_form: "YouTube Quota Extension Form",
};

/** Deadline countdown human-readable (WIB) */
function deadlineInfo(deadlineAt: string | null): { text: string; urgent: boolean } | null {
  if (!deadlineAt) return null;
  const days = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `Lewat ${Math.abs(days)} hari`, urgent: true };
  if (days === 0) return { text: "Hari ini", urgent: true };
  if (days <= 7) return { text: `${days} hari lagi`, urgent: true };
  return { text: `${days} hari lagi`, urgent: false };
}

export function AdminApiAccessPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  // Modal ubah status — paksa isi catatan (siapa-kapan-kenapa)
  const [statusModal, setStatusModal] = useState<{ review: AppReview; next: ReviewStatus } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-api-reviews", statusFilter],
    queryFn: () =>
      api.get<{ reviews: AppReview[] }>(
        `/admin/api-access/reviews${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api-access/reviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-reviews"] });
      toast.success("Entry tracking dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const reviews = data?.reviews ?? [];
  const platformEntries = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Pengajuan Akses API</h1>
          <p className="mt-1 max-w-2xl text-[var(--text-secondary)] text-sm">
            Tracking review aplikasi di setiap platform. Playbook: kirim berkualitas lebih baik
            daripada cepat — setiap penolakan reset antrian dari nol.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Pengajuan Baru
        </Button>
      </div>

      {/* Filter status */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
            statusFilter === "all"
              ? "bg-[var(--accent-gold)] text-white"
              : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Semua ({data?.reviews.length ?? 0})
        </button>
        {(Object.keys(STATUS_META) as ReviewStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
              statusFilter === s
                ? "bg-[var(--accent-gold)] text-white"
                : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] border-dashed p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <p className="mt-3 text-[var(--text-secondary)] text-sm">
            Belum ada tracking pengajuan. Mulai dari platform dengan review terpanjang (LinkedIn 3–6
            bulan, Meta per permission).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const meta = STATUS_META[r.status];
            const deadline = deadlineInfo(r.deadlineAt);
            const checkedCount = Object.values(r.checklist ?? {}).filter(Boolean).length;
            return (
              <div
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-sm">
                        {PLATFORMS[r.platform as keyof typeof PLATFORMS]?.icon &&
                          PLATFORMS[r.platform as keyof typeof PLATFORMS].icon({
                            className: "h-4 w-4",
                          })}
                        {r.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium text-xs ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                      {r.permissionScope && (
                        <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs">
                          {r.permissionScope}
                        </code>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-1 line-clamp-2 text-[var(--text-secondary)] text-sm">
                        {r.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-muted)] text-xs">
                      {r.submissionId && <span>ID: {r.submissionId}</span>}
                      {r.submittedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Dikirim {new Date(r.submittedAt).toLocaleDateString("id-ID")}
                        </span>
                      )}
                      {deadline && (
                        <span
                          className={`flex items-center gap-1 font-medium ${
                            deadline.urgent ? "text-red-500" : "text-[var(--text-secondary)]"
                          }`}
                        >
                          <CalendarClock className="h-3 w-3" />
                          Deadline {deadline.text}
                        </span>
                      )}
                      <span>Checklist {checkedCount}/7</span>
                    </div>
                    {r.status === "rejected" && r.rejectionReason && (
                      <p className="mt-2 rounded-[var(--radius-md)] bg-red-50 p-2 text-red-700 text-xs dark:bg-red-950/50 dark:text-red-300">
                        Alasan penolakan: {r.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {r.dashboardUrl && (
                      <a href={r.dashboardUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" aria-label="Buka dashboard platform">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      aria-label="Hapus tracking"
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Aksi cepat: ubah status — buka modal agar ada catatan */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-[var(--border-light)] border-t pt-3">
                  <span className="text-[var(--text-muted)] text-xs">Ubah status:</span>
                  {(Object.keys(STATUS_META) as ReviewStatus[])
                    .filter((s) => s !== r.status)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`rounded-full px-2 py-0.5 text-xs transition-transform hover:scale-105 ${STATUS_META[s].className}`}
                        onClick={() => setStatusModal({ review: r, next: s })}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                </div>

                {/* Riwayat status — transparansi kenapa status berubah */}
                {r.statusHistory && r.statusHistory.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)]">
                      Riwayat status ({r.statusHistory.length})
                    </summary>
                    <ol className="mt-1.5 space-y-1 border-[var(--border-light)] border-l-2 pl-3">
                      {[...r.statusHistory].reverse().map((h, i) => (
                        <li key={i} className="text-[var(--text-secondary)] text-xs">
                          <span className="font-medium">{STATUS_META[h.status].label}</span>
                          {" · "}
                          {new Date(h.at).toLocaleString("id-ID")}
                          {h.note && (
                            <span className="block text-[var(--text-muted)]">{h.note}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReviewFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        platformEntries={platformEntries}
      />

      <StatusChangeModal
        state={statusModal}
        onClose={() => setStatusModal(null)}
        onDone={() => {
          setStatusModal(null);
          queryClient.invalidateQueries({ queryKey: ["admin-api-reviews"] });
        }}
      />
    </div>
  );
}

/** Modal ubah status — catatan wajib bila reject/withdraw, alasan penolakan diminta saat rejected */
function StatusChangeModal({
  state,
  onClose,
  onDone,
}: {
  state: { review: AppReview; next: ReviewStatus } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  // Reset state saat modal dibuka utk review lain
  const reviewId = state?.review.id;
  const [lastReviewId, setLastReviewId] = useState<string | null>(null);
  if (reviewId && reviewId !== lastReviewId) {
    setLastReviewId(reviewId);
    setNote("");
    setRejectionReason("");
  }

  const update = useMutation({
    mutationFn: () => {
      if (!state) throw new Error("Tidak ada pengajuan dipilih");
      return api.patch(`/admin/api-access/reviews/${state.review.id}`, {
        status: state.next,
        ...(note ? { statusNote: note } : {}),
        ...(state.next === "rejected" && rejectionReason ? { rejectionReason } : {}),
      });
    },
    onSuccess: () => {
      toast.success(`Status → ${STATUS_META[state!.next].label}`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!state) return null;
  const needsReason = state.next === "rejected";

  return (
    <Modal open onClose={onClose} title={`Ubah Status — ${state.review.title}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`rounded-full px-2 py-0.5 font-medium text-xs ${STATUS_META[state.review.status].className}`}
          >
            {STATUS_META[state.review.status].label}
          </span>
          →
          <span
            className={`rounded-full px-2 py-0.5 font-medium text-xs ${STATUS_META[state.next].className}`}
          >
            {STATUS_META[state.next].label}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status-note">Catatan {needsReason ? "(wajib)" : "(opsional)"}</Label>
          <Textarea
            id="status-note"
            rows={2}
            placeholder="mis. Dikirim ulang dengan screencast baru"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-[var(--text-muted)] text-xs">
            Tercatat di riwayat status — siapa, kapan, dan kenapa.
          </p>
        </div>

        {needsReason && (
          <div className="space-y-1.5">
            <Label htmlFor="rejection-reason">Alasan penolakan dari platform (wajib)</Label>
            <Textarea
              id="rejection-reason"
              rows={3}
              placeholder="Tempel pesan penolakan dari dashboard platform…"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={update.isPending || (needsReason && !rejectionReason.trim())}
            onClick={() => update.mutate()}
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Status
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReviewFormModal({
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
  const [title, setTitle] = useState("");
  const [permissionScope, setPermissionScope] = useState("");
  const [description, setDescription] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [checklist, setChecklist] = useState<Partial<Record<ChecklistKey, boolean>>>({});

  const create = useMutation({
    mutationFn: () =>
      api.post("/admin/api-access/reviews", {
        platform,
        title,
        ...(permissionScope ? { permissionScope } : {}),
        ...(description ? { description } : {}),
        ...(dashboardUrl ? { dashboardUrl } : {}),
        ...(deadlineAt ? { deadlineAt: new Date(deadlineAt).toISOString() } : {}),
        checklist,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-reviews"] });
      toast.success("Tracking pengajuan dibuat");
      setTitle("");
      setPermissionScope("");
      setDescription("");
      setDashboardUrl("");
      setDeadlineAt("");
      setChecklist({});
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Pengajuan API Baru" size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rev-platform">Platform</Label>
            <select
              id="rev-platform"
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
            <Label htmlFor="rev-deadline">Deadline follow-up</Label>
            <Input
              id="rev-deadline"
              type="date"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rev-title">Judul pengajuan</Label>
          <Input
            id="rev-title"
            required
            placeholder="mis. Meta App Review — instagram_content_publish"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rev-scope">Permission scope (opsional)</Label>
          <Input
            id="rev-scope"
            placeholder="mis. instagram_content_publish"
            value={permissionScope}
            onChange={(e) => setPermissionScope(e.target.value)}
          />
          <p className="text-[var(--text-muted)] text-xs">
            Meta: 1 permission per submission (jangan campur — penyebab penolakan umum).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rev-desc">Deskripsi use case</Label>
          <Textarea
            id="rev-desc"
            rows={3}
            placeholder="Deskripsi usage unik per permission — jangan copy-paste antar submission"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rev-url">URL dashboard platform</Label>
          <Input
            id="rev-url"
            type="url"
            placeholder="https://developers.facebook.com/apps/..."
            value={dashboardUrl}
            onChange={(e) => setDashboardUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Checklist aset pengajuan</Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(CHECKLIST_LABELS) as ChecklistKey[]).map((key) => {
              const checked = checklist[key] ?? false;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors ${
                    checked
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  }`}
                >
                  {checked ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0" />
                  )}
                  {CHECKLIST_LABELS[key]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
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
