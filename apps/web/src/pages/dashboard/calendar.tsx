// Halaman Kalender — multi-view (bulan/minggu/hari) dengan drag-drop reschedule + notes
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DayView } from "@/components/calendar/day-view";
import { ManualReminderPanel } from "@/components/calendar/manual-reminder-panel";
import { MonthView } from "@/components/calendar/month-view";
import { PostDetailModal } from "@/components/calendar/post-detail-modal";
import {
  type CalendarNote,
  type CalendarPostGroup,
  groupByDate,
  MONTHS_ID,
  NOTE_COLORS,
  startOfWeek,
  toLocalISODate,
} from "@/components/calendar/shared";
import { WeekView } from "@/components/calendar/week-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";

type ViewMode = "month" | "week" | "day";

/** Konflik jadwal: dua post terjadwal di akun yang sama dengan selisih < 10 menit */
type ScheduleConflict = {
  socialAccountId: string;
  platform: string;
  accountUsername: string;
  postA: { id: string; caption: string; scheduledAt: string };
  postB: { id: string; caption: string; scheduledAt: string };
  deltaMinutes: number;
};

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "month", label: "Bulan" },
  { key: "week", label: "Minggu" },
  { key: "day", label: "Hari" },
];

type NoteModalState = {
  date: string;
  id?: string;
  title: string;
  content: string;
  color: string;
} | null;

export function CalendarPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [noteModal, setNoteModal] = useState<NoteModalState>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  // Post group terpilih untuk modal detail (klik kartu post di grid)
  const [selectedGroup, setSelectedGroup] = useState<CalendarPostGroup | null>(null);

  // Rentang fetch: sekitar view aktif (bulatkan ke grid bulanan agar semua view tercover)
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7)); // mulai Senin
  const from = toLocalISODate(gridStart);
  const to = toLocalISODate(new Date(gridStart.getTime() + 41 * 86400000));

  const { data: postsData } = useQuery({
    queryKey: ["calendar-posts", from, to],
    queryFn: () =>
      api.get<{ groups: CalendarPostGroup[] }>(`/posts?from=${from}&to=${to}&includeExternal=1`),
  });
  const { data: notesData } = useQuery({
    queryKey: ["calendar-notes", from, to],
    queryFn: () => api.get<{ notes: CalendarNote[] }>(`/calendar/notes?from=${from}&to=${to}`),
  });
  // Deteksi konflik jadwal (±10 menit di akun yang sama) untuk range aktif.
  // Guard: endpoint gagal (404/500) → anggap tidak ada konflik, tanpa crash.
  const { data: conflictsData } = useQuery({
    queryKey: ["calendar-conflicts", from, to],
    queryFn: () =>
      api
        .get<{ conflicts: ScheduleConflict[] }>(`/posts/conflicts?from=${from}&to=${to}`)
        .catch(() => ({ conflicts: [] as ScheduleConflict[] })),
  });
  const conflicts = conflictsData?.conflicts ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-notes"] });
  };

  const saveNote = useMutation({
    mutationFn: (note: NonNullable<NoteModalState>) =>
      note.id
        ? api.patch(`/calendar/notes/${note.id}`, {
            title: note.title,
            content: note.content,
            color: note.color,
          })
        : api.post("/calendar/notes", {
            date: note.date,
            title: note.title,
            content: note.content,
            color: note.color,
          }),
    onSuccess: () => {
      invalidate();
      setNoteModal(null);
      toast.success("Catatan tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/notes/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Catatan dihapus");
    },
  });

  // Reschedule drag-drop: PATCH /posts/:id dengan jam dipertahankan / jam slot target
  const reschedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      api.patch(`/posts/${id}`, { scheduledAt }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(`Jadwal dipindah ke ${formatDate(vars.scheduledAt, "short")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Import manual post eksternal: fetch konten terbit langsung di platform → DB.
  // Worker juga sinkron otomatis tiap 4 jam; tombol ini untuk yang ingin segera.
  const syncPosts = useMutation({
    mutationFn: () => api.post<{ summary: { totalPostsImported: number } }>("/posts/sync", {}),
    onSuccess: (data) => {
      invalidate();
      const n = data.summary?.totalPostsImported ?? 0;
      toast.success(
        n > 0 ? `${n} konten platform berhasil diimpor` : "Konten platform sudah terbaru",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postsByDate = groupByDate(postsData?.groups ?? []);
  const notesByDate = groupByDate(notesData?.notes ?? []);
  const todayKey = toLocalISODate(new Date());

  // Id post yang terlibat konflik → petakan ke id post group untuk highlight grid.
  // (konflik dilaporkan per post/akun, grid merender per post group)
  const conflictedGroupIds = useMemo(() => {
    const postIds = new Set(conflicts.flatMap((c) => [c.postA.id, c.postB.id]));
    const groupIds = new Set<string>();
    if (postIds.size > 0) {
      for (const g of postsData?.groups ?? []) {
        if (g.posts.some((p) => postIds.has(p.id))) groupIds.add(g.id);
      }
    }
    return groupIds;
  }, [conflicts, postsData?.groups]);

  // Aksi drag-drop dari month view: pertahankan jam asli, ganti tanggal saja
  function handleRescheduleDate(groupId: string, dateKey: string) {
    const groups = [...postsByDate.values()].flat();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const original = group.scheduledAt ? new Date(group.scheduledAt) : new Date();
    const [y, m, d] = dateKey.split("-").map(Number);
    const next = new Date(y!, m! - 1, d!, original.getHours(), original.getMinutes(), 0, 0);
    reschedule.mutate({ id: groupId, scheduledAt: next.toISOString() });
  }

  // Aksi drag-drop dari week/day view: tanggal + jam slot target
  function handleRescheduleDateTime(groupId: string, dateKey: string, hour: number) {
    const groups = [...postsByDate.values()].flat();
    const group = groups.find((g) => g.id === groupId);
    const originalMinutes = group?.scheduledAt ? new Date(group.scheduledAt).getMinutes() : 0;
    const [y, m, d] = dateKey.split("-").map(Number);
    const next = new Date(y!, m! - 1, d!, hour, originalMinutes, 0, 0);
    reschedule.mutate({ id: groupId, scheduledAt: next.toISOString() });
  }

  // Navigasi antar periode sesuai view
  function shiftPeriod(direction: 1 | -1) {
    if (view === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
    } else if (view === "week") {
      const next = new Date(cursor);
      next.setDate(cursor.getDate() + direction * 7);
      setCursor(next);
    } else {
      const next = new Date(cursor);
      next.setDate(cursor.getDate() + direction);
      setCursor(next);
    }
  }

  // Label periode di header
  const periodLabel =
    view === "month"
      ? `${MONTHS_ID[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === "week"
        ? `${formatDate(startOfWeek(cursor), "short")} – ${formatDate(
            new Date(startOfWeek(cursor).getTime() + 6 * 86400000),
            "short",
          )}`
        : formatDate(cursor, "long");

  const commonProps = {
    postsByDate,
    notesByDate,
    todayKey,
    conflictedGroupIds,
    onSelectPost: (groupId: string) => {
      const group = (postsData?.groups ?? []).find((g) => g.id === groupId);
      if (group) setSelectedGroup(group);
    },
    onAddNote: (dateKey: string) =>
      setNoteModal({ date: dateKey, title: "", content: "", color: NOTE_COLORS[0]!.value }),
    onEditNote: (note: CalendarNote) =>
      setNoteModal({
        date: note.date.slice(0, 10),
        id: note.id,
        title: note.title,
        content: note.content ?? "",
        color: note.color ?? NOTE_COLORS[0]!.value,
      }),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Kalender Konten</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Rencanakan jadwal posting — geser kartu untuk ubah jadwal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Peringatan konflik jadwal (±10 menit di akun yang sama) */}
          {conflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setConflictModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1.5 font-medium text-xs text-yellow-700 transition-opacity hover:opacity-80 dark:text-yellow-400"
              title="Dua post terjadwal untuk akun yang sama dengan selisih waktu kurang dari 10 menit"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {conflicts.length} konflik jadwal
            </button>
          )}

          {/* Switch view */}
          <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5">
            {VIEW_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setView(t.key)}
                className={`rounded-[var(--radius-sm)] px-3 py-1.5 font-medium text-xs transition-colors ${
                  view === t.key
                    ? "bg-gradient text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftPeriod(-1)}
            aria-label="Periode sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-32 text-center font-semibold">{periodLabel}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftPeriod(1)}
            aria-label="Periode berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            Hari ini
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncPosts.mutate()}
            disabled={syncPosts.isPending}
            title="Import konten yang dipublikasikan langsung di platform (30 hari terakhir)"
          >
            {syncPosts.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sinkron Platform
          </Button>
          <Link to="/compose">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Buat Konten
            </Button>
          </Link>
        </div>
      </div>

      {/* Panel post manual terjadwal — aktifkan pengingat push */}
      <ManualReminderPanel groups={postsData?.groups ?? []} />

      {view === "month" && (
        <MonthView {...commonProps} cursor={cursor} onReschedule={handleRescheduleDate} />
      )}
      {view === "week" && (
        <WeekView {...commonProps} cursor={cursor} onReschedule={handleRescheduleDateTime} />
      )}
      {view === "day" && (
        <DayView
          {...commonProps}
          date={cursor}
          dateKey={toLocalISODate(cursor)}
          onReschedule={handleRescheduleDateTime}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[var(--text-muted)] text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-[var(--accent-gold-light)]" /> Posting terjadwal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-[var(--border)] border-dashed bg-[var(--bg-tertiary)]" />{" "}
          Konten platform (eksternal)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-[var(--accent-pink)] border-l-2 bg-[var(--bg-tertiary)]" />{" "}
          Catatan
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" /> Geser kartu ke tanggal/jam lain untuk reschedule
        </span>
      </div>

      {/* Modal detail post (klik kartu post) */}
      <PostDetailModal group={selectedGroup} onClose={() => setSelectedGroup(null)} />

      {/* Modal catatan */}
      {noteModal && (
        <Modal
          open
          onClose={() => setNoteModal(null)}
          title={noteModal.id ? "Edit Catatan" : `Catatan — ${formatDate(noteModal.date)}`}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveNote.mutate(noteModal);
            }}
          >
            <Input
              placeholder="Judul catatan (mis. ide konten)"
              value={noteModal.title}
              onChange={(e) => setNoteModal({ ...noteModal, title: e.target.value })}
              required
              maxLength={200}
            />
            <Textarea
              placeholder="Detail catatan..."
              rows={4}
              value={noteModal.content}
              onChange={(e) => setNoteModal({ ...noteModal, content: e.target.value })}
            />
            <div className="space-y-1.5">
              <span className="font-medium text-[var(--text-secondary)] text-xs">Warna</span>
              <div className="flex gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setNoteModal({ ...noteModal, color: c.value })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      noteModal.color === c.value
                        ? "scale-110 border-[var(--text-primary)]"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              {noteModal.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteNote.mutate(noteModal.id!);
                    setNoteModal(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setNoteModal(null)}>
                  Batal
                </Button>
                <Button type="submit" disabled={saveNote.isPending}>
                  {saveNote.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal daftar konflik jadwal */}
      {conflictModalOpen && (
        <Modal
          open
          onClose={() => setConflictModalOpen(false)}
          title="Konflik Jadwal Posting"
          description="Dua post terjadwal untuk akun yang sama dengan selisih waktu kurang dari 10 menit — renggangkan jadwalnya agar tidak menumpuk."
          size="lg"
        >
          <div className="space-y-3">
            {conflicts.map((c) => {
              const cfg = PLATFORMS[c.platform as keyof typeof PLATFORMS];
              const Icon = cfg?.icon;
              return (
                <div
                  key={`${c.socialAccountId}-${c.postA.id}-${c.postB.id}`}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
                      {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: cfg?.color }} />}
                      {cfg?.label ?? c.platform} · @{c.accountUsername}
                    </span>
                    <Badge variant="warning" className="shrink-0">
                      {c.deltaMinutes} mnt
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1">
                    {[c.postA, c.postB].map((p) => (
                      <div
                        key={p.id}
                        className="flex items-start justify-between gap-2 rounded bg-[var(--bg-tertiary)] px-2 py-1.5"
                      >
                        <span className="line-clamp-2 flex-1 text-[var(--text-secondary)] text-xs">
                          {p.caption}
                        </span>
                        <span className="shrink-0 font-mono text-[var(--text-secondary)] text-xs">
                          {formatDate(p.scheduledAt, "short")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setConflictModalOpen(false);
                        navigate("/queue");
                      }}
                    >
                      Lihat Post
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
