// Panel import CSV massal — upload/preview/validasi/import post dari spreadsheet
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type RowResult = {
  row: number;
  status: "valid" | "error";
  caption: string;
  platforms: string[];
  scheduledAt: string | null;
  errors: string[];
};

type ImportResult = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  imported: number;
  rows: RowResult[];
};

const SAMPLE_CSV = `caption,platforms,scheduled_date,scheduled_time,hashtags,first_comment
Promo akhir bulan diskon 30%!,instagram,tiktok,${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)},09:00,promo,diskon,Stok terbatas ya kak!
Tips memilih bahan bekualitas untuk UMKM,tiktok,${new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10)},19:00,tips,umkm,
Testimoni pelanggan ke-3 bulan ini,instagram,${new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10)},12:00,testimoni,`;

export function CsvImportPanel() {
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMutation({
    mutationFn: (csvText: string) =>
      api.post<ImportResult>("/import/csv", { csv: csvText, importMode: false }),
    onSuccess: (res) => setResult(res),
    onError: (e: Error) => toast.error(e.message),
  });

  const doImport = useMutation({
    mutationFn: (csvText: string) =>
      api.post<ImportResult>("/import/csv", { csv: csvText, importMode: true }),
    onSuccess: (res) => {
      setResult(res);
      if (res.imported > 0) {
        toast.success(`${res.imported} post berhasil di-import`);
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      setCsv(text);
      preview.mutate(text);
    };
    reader.readAsText(file);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-konten.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-[var(--accent-gold)]" />
          Import Massal (CSV)
        </h2>
        <button
          type="button"
          onClick={downloadSample}
          className="flex items-center gap-1 text-[var(--text-muted)] text-xs hover:text-[var(--accent-gold)]"
        >
          <Download className="h-3 w-3" />
          Unduh template
        </button>
      </div>

      <p className="text-[var(--text-secondary)] text-xs">
        Buat banyak post sekaligus dari spreadsheet. Kolom:{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">caption</code> (wajib),{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">platforms</code> (mis.{" "}
        instagram,tiktok),{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">scheduled_date</code> (YYYY-MM-DD),{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">scheduled_time</code> (HH:mm WIB),{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">hashtags</code>,{" "}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">first_comment</code>. Post dengan
        jadwal → status <b>terjadwal</b>; tanpa jadwal → <b>draft</b>.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Pilih File CSV
        </Button>
        {csv && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => preview.mutate(csv)}
            disabled={preview.isPending}
          >
            {preview.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Validasi Ulang
          </Button>
        )}
      </div>

      <Textarea
        rows={4}
        placeholder="atau tempel isi CSV di sini..."
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        className="font-mono text-xs"
      />

      {csv && (
        <Button
          type="button"
          onClick={() => doImport.mutate(csv)}
          disabled={doImport.isPending || preview.isPending}
        >
          {doImport.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Import {result?.validRows ? `${result.validRows} Post` : ""}
        </Button>
      )}

      {/* Hasil preview */}
      {result && (
        <div className="space-y-2">
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-1">
              Total: {result.totalRows}
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Valid: {result.validRows}
            </span>
            {result.errorRows > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-1 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                Error: {result.errorRows}
              </span>
            )}
            {result.imported > 0 && (
              <span className="rounded-full bg-[var(--accent-gold-light)] px-2 py-1 font-medium text-[var(--accent-gold)]">
                Ter-import: {result.imported}
              </span>
            )}
          </div>

          <div className="max-h-60 space-y-1.5 overflow-y-auto">
            {result.rows.map((row) => (
              <div
                key={row.row}
                className={cn(
                  "flex items-start gap-2 rounded-[var(--radius-md)] border p-2 text-xs",
                  row.status === "valid"
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                    : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                )}
              >
                {row.status === "valid" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    Baris {row.row}: {row.caption.slice(0, 60) || "(kosong)"}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {row.platforms.join(", ") || "tanpa platform"}
                    {row.scheduledAt && ` · ${new Date(row.scheduledAt).toLocaleString("id-ID")}`}
                  </p>
                  {row.errors.length > 0 && (
                    <p className="mt-0.5 text-red-600 dark:text-red-400">{row.errors.join("; ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
