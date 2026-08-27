"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReportFormat = "json" | "csv" | "pdf";
type ReportPeriod = "7d" | "30d" | "90d";

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "7d", label: "7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
];

const FORMAT_OPTIONS: {
  value: ReportFormat;
  label: string;
  description: string;
}[] = [
  { value: "json", label: "JSON", description: "Data mentah untuk analisis" },
  { value: "csv", label: "CSV", description: "Untuk Excel/Spreadsheet" },
  { value: "pdf", label: "PDF/HTML", description: "Laporan visual" },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  async function generateReport() {
    setLoading(true);
    setError(null);
    setLastGenerated(null);

    try {
      const params = new URLSearchParams({
        organizationId: "current",
        period,
        format,
      });

      const res = await fetch(`/api/analytics/reports?${params.toString()}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal generate report.");
      }

      if (format === "json") {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        downloadBlob(blob, `report-${period}.json`);
      } else if (format === "csv") {
        const text = await res.text();
        const blob = new Blob([text], { type: "text/csv" });
        downloadBlob(blob, `report-${period}.csv`);
      } else if (format === "pdf") {
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html" });
        downloadBlob(blob, `report-${period}.html`);
      }

      setLastGenerated(new Date().toLocaleString("id-ID"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate report.");
    } finally {
      setLoading(false);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Generate Report</h1>
        <p className="text-sm text-muted-foreground">
          Buat laporan analitik untuk diekspor atau dianalisis lebih lanjut.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          {error}
        </p>
      )}

      {lastGenerated && (
        <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
          Report terakhir digenerate: {lastGenerated}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-medium">Periode</h2>
          <div className="space-y-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "flex w-full items-center rounded-lg border p-3 text-left transition-colors",
                  period === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                <FileText className="mr-3 h-4 w-4" />
                <span className="text-sm">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-medium">Format</h2>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={cn(
                  "flex w-full items-center rounded-lg border p-3 text-left transition-colors",
                  format === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                <Download className="mr-3 h-4 w-4" />
                <div>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={generateReport} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Generate & Download
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
