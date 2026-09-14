// Halaman Laporan — ringkasan performa periode, export CSV, jadwal email berkala.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronDown,
  Download,
  FileBarChart,
  FileDown,
  Loader2,
  Mail,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ShareReportPanel } from "@/components/dashboard/share-report-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { generatePdfReport } from "@/lib/pdf-report";
import { PLATFORMS } from "@/lib/platforms";

type ReportData = {
  organizationName: string;
  from: string;
  to: string;
  postsPublished: number;
  totalEngagement: number;
  totalImpressions: number;
  totalReach: number;
  accounts: {
    username: string;
    platform: string;
    followersStart: number | null;
    followersEnd: number | null;
  }[];
  topPosts: {
    content: string;
    platform: string;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagement: number;
  }[];
};

type Schedule = {
  id: string;
  email: string;
  frequency: string;
  sendDay: number;
  sendHour: number;
  isActive: boolean;
  lastSentAt: string | null;
};

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function formatNum(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function ReportsPage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [form, setForm] = useState({
    email: "",
    frequency: "weekly" as "weekly" | "monthly",
    sendDay: "1",
    sendHour: "8",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-summary", from, to],
    queryFn: () => api.get<{ report: ReportData }>(`/reports/summary?from=${from}&to=${to}`),
  });
  const { data: schedulesData } = useQuery({
    queryKey: ["report-schedules"],
    queryFn: () => api.get<{ schedules: Schedule[] }>("/reports/schedules"),
  });
  const schedules = schedulesData?.schedules ?? [];
  const report = data?.report;

  const exportCsv = useMutation({
    mutationFn: () =>
      api.get<{ csv: string; filename: string }>(`/reports/export?from=${from}&to=${to}`),
    onSuccess: (res) => {
      const blob = new Blob(["\uFEFF" + res.csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laporan CSV diunduh");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Export PDF branded — data sama dengan CSV (getReportData), render via print
  const exportPdf = () => {
    if (!report) return;
    try {
      generatePdfReport(report);
      toast.success("Dialog cetak dibuka — pilih Simpan sebagai PDF");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuka PDF");
    }
  };

  const createSchedule = useMutation({
    mutationFn: () =>
      api.post("/reports/schedules", {
        email: form.email,
        frequency: form.frequency,
        sendDay: Number(form.sendDay),
        sendHour: Number(form.sendHour),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      setScheduleModal(false);
      setForm((f) => ({ ...f, email: "" }));
      toast.success("Jadwal laporan dibuat");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Jadwal dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSchedule = useMutation({
    mutationFn: (s: Schedule) => api.patch(`/reports/schedules/${s.id}`, { isActive: !s.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function scheduleLabel(s: Schedule): string {
    if (s.frequency === "weekly") {
      return `Setiap ${DAY_NAMES[s.sendDay] ?? "-"} jam ${String(s.sendHour).padStart(2, "0")}:00 WIB`;
    }
    return `Tanggal ${s.sendDay} tiap bulan, jam ${String(s.sendHour).padStart(2, "0")}:00 WIB`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <FileBarChart className="h-6 w-6 text-[var(--accent-gold)]" />
            Laporan
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Ringkasan performa dari data analytics riil — export atau terima via email
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            trigger={
              <Button size="sm" variant="outline" disabled={exportCsv.isPending || isLoading}>
                {exportCsv.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <DropdownLabel>Pilih format export</DropdownLabel>
            <DropdownItem
              onClick={() => exportCsv.mutate()}
              disabled={exportCsv.isPending || isLoading}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </DropdownItem>
            <DropdownItem onClick={exportPdf} disabled={isLoading || !report}>
              <FileDown className="h-4 w-4" />
              Export PDF (via Print)
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Halaman Ini
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Filter periode */}
      <div className="card flex flex-wrap items-end gap-3 p-4 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="report-from" className="text-xs">
            Dari
          </Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-to" className="text-xs">
            Sampai
          </Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
        {report && (
          <p className="text-[var(--text-muted)] text-xs">
            Periode {formatDate(report.from)} – {formatDate(report.to)}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : report ? (
        <>
          {/* Kartu ringkasan */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Postingan Tayang", value: report.postsPublished },
              { label: "Total Engagement", value: report.totalEngagement },
              { label: "Total Impressions", value: report.totalImpressions },
              { label: "Jangkauan (Reach)", value: report.totalReach },
            ].map((s) => (
              <div key={s.label} className="card p-6">
                <p className="font-bold text-2xl">{formatNum(s.value)}</p>
                <p className="mt-1 text-[var(--text-secondary)] text-xs">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Pertumbuhan followers */}
          <div className="card p-6">
            <h2 className="mb-4 font-semibold">Pertumbuhan Followers</h2>
            {report.accounts.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-sm">
                Belum ada data analytics akun dalam periode ini. Hubungkan akun & tunggu
                sinkronisasi analytics.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] text-xs">
                    <th className="pb-2">Akun</th>
                    <th className="pb-2 text-right">Awal</th>
                    <th className="pb-2 text-right">Akhir</th>
                    <th className="pb-2 text-right">Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {report.accounts.map((a) => {
                    const growth =
                      a.followersStart !== null && a.followersEnd !== null
                        ? a.followersEnd - a.followersStart
                        : 0;
                    return (
                      <tr
                        key={`${a.platform}-${a.username}`}
                        className="border-[var(--border-light)] border-t"
                      >
                        <td className="py-2.5">
                          <span className="font-medium">@{a.username}</span>
                          <span className="ml-2 text-[var(--text-muted)] text-xs">
                            {PLATFORMS[a.platform as keyof typeof PLATFORMS]?.label ?? a.platform}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">{formatNum(a.followersStart ?? 0)}</td>
                        <td className="py-2.5 text-right">{formatNum(a.followersEnd ?? 0)}</td>
                        <td
                          className={`py-2.5 text-right font-semibold ${
                            growth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                          }`}
                        >
                          {growth >= 0 ? "+" : ""}
                          {formatNum(growth)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Top posts */}
          <div className="card p-6">
            <h2 className="mb-4 font-semibold">Top Postingan (by engagement)</h2>
            {report.topPosts.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-sm">
                Belum ada postingan dengan data engagement dalam periode ini.
              </p>
            ) : (
              <div className="space-y-2">
                {report.topPosts.map((p, i) => {
                  const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] font-bold text-xs">
                        {i + 1}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {p.content || "(tanpa caption)"}
                      </p>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {cfg?.label ?? p.platform}
                      </Badge>
                      <span className="shrink-0 font-semibold text-sm">
                        {formatNum(p.engagement)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Link laporan publik (shareable) */}
      <ShareReportPanel />

      {/* Jadwal email berkala */}
      <div className="card space-y-4 p-6 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Mail className="h-4 w-4 text-[var(--accent-gold)]" />
              Laporan Email Berkala
            </h2>
            <p className="mt-1 text-[var(--text-secondary)] text-xs">
              Terima ringkasan performa otomatis ke email Anda — mingguan atau bulanan
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setScheduleModal(true)}>
            <Plus className="h-4 w-4" />
            Tambah
          </Button>
        </div>

        {schedules.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">
            Belum ada jadwal. Tambahkan untuk menerima laporan otomatis.
          </p>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" />
                  <div>
                    <p className="font-medium text-sm">{s.email}</p>
                    <p className="text-[var(--text-muted)] text-xs">
                      {scheduleLabel(s)}
                      {s.lastSentAt &&
                        ` · terakhir terkirim ${formatDate(s.lastSentAt.slice(0, 10))}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSchedule.mutate(s)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      s.isActive ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]"
                    }`}
                    aria-label={s.isActive ? "Nonaktifkan" : "Aktifkan"}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        s.isActive ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSchedule.mutate(s.id)}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:text-red-500"
                    aria-label="Hapus jadwal"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal tambah jadwal */}
      <Modal
        open={scheduleModal}
        onClose={() => setScheduleModal(false)}
        title="Jadwal Laporan Email"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createSchedule.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sched-email">Email Penerima</Label>
            <Input
              id="sched-email"
              type="email"
              placeholder="owner@umkm.id"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Frekuensi</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["weekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      frequency: f,
                      sendDay: f === "weekly" ? "1" : "1",
                    }))
                  }
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                    form.frequency === f
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)]"
                  }`}
                >
                  {f === "weekly" ? "Mingguan" : "Bulanan"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sched-day">
                {form.frequency === "weekly" ? "Hari Kirim" : "Tanggal Kirim"}
              </Label>
              {form.frequency === "weekly" ? (
                <select
                  id="sched-day"
                  value={form.sendDay}
                  onChange={(e) => setForm((f) => ({ ...f, sendDay: e.target.value }))}
                  className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-sm"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="sched-day"
                  type="number"
                  min={1}
                  max={28}
                  value={form.sendDay}
                  onChange={(e) => setForm((f) => ({ ...f, sendDay: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-hour">Jam (WIB)</Label>
              <Input
                id="sched-hour"
                type="number"
                min={0}
                max={23}
                value={form.sendHour}
                onChange={(e) => setForm((f) => ({ ...f, sendHour: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setScheduleModal(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createSchedule.isPending}>
              {createSchedule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Jadwal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
