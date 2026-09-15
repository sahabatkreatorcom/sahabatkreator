// Admin: Kalender Hari Besar — CRUD + import CSV/XLSX.
// Data holiday dipakai widget ide konten di dashboard & penanda di kalender.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type Holiday = {
  id: string;
  name: string;
  description: string | null;
  month: number;
  day: number;
  scope: "national" | "international";
  category: string;
  ideaTemplates: { angle: string; example: string }[] | null;
  suggestedHashtags: string[] | null;
  isActive: boolean;
};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const EMPTY_FORM = {
  name: "",
  description: "",
  month: "1",
  day: "1",
  scope: "national" as "national" | "international",
  category: "umum",
  hashtags: "",
  ideas: "",
  isActive: true,
};

/** Konversi file CSV/XLSX → teks CSV (header baris pertama). */
async function fileToCsv(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return file.text();
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}

export function AdminHolidaysPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [editModal, setEditModal] = useState<{ holiday: Holiday | null } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [importModal, setImportModal] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    okRows: number;
    errorRows: number;
    imported: number;
    rows: { row: number; status: "ok" | "error"; message?: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-holidays", search, monthFilter],
    queryFn: () => {
      const params = new URLSearchParams({ perPage: "200" });
      if (search.trim()) params.set("search", search.trim());
      if (monthFilter) params.set("month", monthFilter);
      return api.get<{ holidays: Holiday[]; total: number }>(
        `/admin/holidays?${params.toString()}`,
      );
    },
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditModal({ holiday: null });
  }

  function openEdit(h: Holiday) {
    setForm({
      name: h.name,
      description: h.description ?? "",
      month: String(h.month),
      day: String(h.day),
      scope: h.scope,
      category: h.category,
      hashtags: (h.suggestedHashtags ?? []).join("; "),
      ideas: (h.ideaTemplates ?? []).map((i) => `${i.angle}: ${i.example}`).join("\n"),
      isActive: h.isActive,
    });
    setEditModal({ holiday: h });
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        month: Number(form.month),
        day: Number(form.day),
        scope: form.scope,
        category: form.category || "umum",
        suggestedHashtags: form.hashtags
          .split(/[;|]/)
          .map((s) => s.trim().replace(/^#/, ""))
          .filter(Boolean),
        ideaTemplates: form.ideas
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const sep = line.indexOf(":");
            return sep > 0
              ? { angle: line.slice(0, sep).trim(), example: line.slice(sep + 1).trim() }
              : { angle: line, example: "" };
          }),
        isActive: form.isActive,
      };
      return editModal?.holiday
        ? api.patch(`/admin/holidays/${editModal.holiday.id}`, payload)
        : api.post("/admin/holidays", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
      setEditModal(null);
      toast.success("Hari besar tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
      toast.success("Hari besar dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/holidays/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
    },
  });

  const runImport = useMutation({
    mutationFn: async (file: File) => {
      const csv = await fileToCsv(file);
      return api.post<NonNullable<typeof importResult>>("/admin/holidays/import", { csv });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
      setImportResult(result);
      toast.success(`${result.imported} baris berhasil diproses`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const holidays = data?.holidays ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Kalender Hari Besar</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            {data?.total ?? 0} hari besar — sumber ide konten untuk semua pengguna
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportModal(true)}>
            <Upload className="h-4 w-4" />
            Import CSV/Excel
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Hari Besar
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama hari besar…"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Semua bulan</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs uppercase">
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Tidak ada hari besar yang cocok.
                </td>
              </tr>
            ) : (
              holidays.map((h) => (
                <tr key={h.id} className="border-[var(--border-light)] border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">
                    {String(h.day).padStart(2, "0")} {MONTHS[h.month - 1]}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{h.name}</p>
                    {h.description && (
                      <p className="mt-0.5 line-clamp-1 text-[var(--text-muted)] text-xs">
                        {h.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={h.scope === "national" ? "primary" : "secondary"}>
                      {h.scope === "national" ? "Indonesia" : "Internasional"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 capitalize">{h.category}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive.mutate({ id: h.id, isActive: !h.isActive })}
                      className="underline decoration-dotted underline-offset-4 hover:text-[var(--accent-gold)]"
                      title={h.isActive ? "Nonaktifkan" : "Aktifkan"}
                    >
                      <Badge variant={h.isActive ? "success" : "secondary"}>
                        {h.isActive ? "aktif" : "nonaktif"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(h)}
                        className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        aria-label={`Edit ${h.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Hapus "${h.name}"?`)) remove.mutate(h.id);
                        }}
                        className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
                        aria-label={`Hapus ${h.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal create/edit */}
      <Modal
        open={editModal !== null}
        onClose={() => setEditModal(null)}
        title={editModal?.holiday ? "Edit Hari Besar" : "Tambah Hari Besar"}
        description="Hari ini berulang setiap tahun (recurring)."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditModal(null)}>
              Batal
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="h-name">Nama hari besar</Label>
            <Input
              id="h-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Hari Batik Nasional"
            />
          </div>
          <div>
            <Label htmlFor="h-month">Bulan</Label>
            <select
              id="h-month"
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="h-day">Tanggal</Label>
            <Input
              id="h-day"
              type="number"
              min={1}
              max={31}
              value={form.day}
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="h-scope">Scope</Label>
            <select
              id="h-scope"
              value={form.scope}
              onChange={(e) =>
                setForm((f) => ({ ...f, scope: e.target.value as "national" | "international" }))
              }
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="national">Indonesia (nasional)</option>
              <option value="international">Internasional</option>
            </select>
          </div>
          <div>
            <Label htmlFor="h-category">Kategori</Label>
            <Input
              id="h-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="umum / retail / kuliner / pendidikan"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="h-desc">Deskripsi</Label>
            <Input
              id="h-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Momentum & konteks hari besar"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="h-hashtags">Hashtag rekomendasi</Label>
            <Input
              id="h-hashtags"
              value={form.hashtags}
              onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))}
              placeholder="HariBatik; BatikNusantara"
            />
            <p className="mt-1 text-[var(--text-muted)] text-xs">Pisahkan dengan ;</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="h-ideas">Ide konten (satu per baris)</Label>
            <textarea
              id="h-ideas"
              value={form.ideas}
              onChange={(e) => setForm((f) => ({ ...f, ideas: e.target.value }))}
              rows={4}
              placeholder={"Promo: diskon khusus hari batik\nEdukasi: sejarah motif batik daerah"}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[var(--text-muted)] text-xs">
              Format per baris: "angle: example"
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4"
            />
            Aktif (tampil di rekomendasi pengguna)
          </label>
        </div>
      </Modal>

      {/* Modal import */}
      <Modal
        open={importModal}
        onClose={() => {
          setImportModal(false);
          setImportResult(null);
        }}
        title="Import Hari Besar"
        description="Format CSV atau Excel (.xlsx). Baris duplikat (bulan + tanggal + nama sama) akan di-update."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setImportModal(false);
                setImportResult(null);
              }}
            >
              Tutup
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={runImport.isPending}>
              {runImport.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Pilih File
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                runImport.mutate(file);
                e.target.value = "";
              }
            }}
          />
          <div className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-4 text-sm">
            <p className="mb-2 font-medium">Kolom yang dikenali:</p>
            <ul className="space-y-1 text-[var(--text-secondary)] text-xs">
              <li>
                <code>name</code>, <code>month</code> (1-12), <code>day</code> (1-31),{" "}
                <code>scope</code> (national/international) —{" "}
                <span className="font-medium">wajib</span>
              </li>
              <li>
                <code>description</code>, <code>category</code> — opsional
              </li>
              <li>
                <code>suggested_hashtags</code> — pisahkan dengan ; atau |
              </li>
              <li>
                <code>idea_templates</code> — satu ide per baris, format "angle: example"
              </li>
              <li>
                <code>is_active</code> — true/false (default true)
              </li>
            </ul>
          </div>

          {importResult && (
            <div className="space-y-2">
              <p className="text-sm">
                {importResult.imported} baris diproses · {importResult.okRows} sukses ·{" "}
                {importResult.errorRows} gagal
              </p>
              {importResult.errorRows > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/5 p-3">
                  {importResult.rows
                    .filter((r) => r.status === "error")
                    .map((r) => (
                      <p key={r.row} className="text-red-500 text-xs">
                        Baris {r.row}: {r.message}
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}

          <p className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
            <CalendarDays className="h-3.5 w-3.5" />
            File .xlsx otomatis dikonversi ke CSV di browser sebelum dikirim.
          </p>
        </div>
      </Modal>
    </div>
  );
}
