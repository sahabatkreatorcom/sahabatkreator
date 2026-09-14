// Admin: Tes API Platform — suite diagnostik Graph API / platform API
// Verifikasi konfigurasi sebelum pengajuan App Review (audit HIGH D1).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";

type TestStatus = "pass" | "fail" | "warn";

type TestResult = {
  name: string;
  status: TestStatus;
  message: string;
  durationMs: number;
};

type PlatformSummary = {
  platform: string;
  lastRun: string | null;
  results: TestResult[] | null;
};

/** Platform yang punya suite diagnostik (harus sinkron dengan server) */
const TESTABLE_PLATFORMS = [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
] as const;

const STATUS_META: Record<
  TestStatus,
  { icon: typeof CheckCircle2; label: string; className: string }
> = {
  pass: {
    icon: CheckCircle2,
    label: "Lolos",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  fail: {
    icon: XCircle,
    label: "Gagal",
    className: "text-red-600 dark:text-red-400",
  },
  warn: {
    icon: AlertTriangle,
    label: "Perhatian",
    className: "text-amber-600 dark:text-amber-400",
  },
};

/** Ringkasan warna badge card per hasil terakhir */
function cardBadge(results: TestResult[] | null) {
  if (!results) return { variant: "secondary" as const, label: "Belum dites" };
  const fail = results.filter((r) => r.status === "fail").length;
  const warn = results.filter((r) => r.status === "warn").length;
  if (fail > 0) return { variant: "danger" as const, label: `${fail} gagal` };
  if (warn > 0) return { variant: "warning" as const, label: `${warn} perhatian` };
  return { variant: "success" as const, label: "Semua lolos" };
}

function ResultRow({ result }: { result: TestResult }) {
  const meta = STATUS_META[result.status];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{result.name}</p>
        <p className="mt-0.5 text-[var(--text-secondary)] text-xs">{result.message}</p>
      </div>
      <span className="shrink-0 text-[var(--text-muted)] text-xs tabular-nums">
        {result.durationMs} ms
      </span>
    </li>
  );
}

function PlatformCard({
  summary,
  onRun,
  running,
}: {
  summary: PlatformSummary;
  onRun: (platform: string) => void;
  running: boolean;
}) {
  const cfg = PLATFORMS[summary.platform as keyof typeof PLATFORMS] ?? PLATFORMS.manual;
  const Icon = cfg.icon;
  const badge = cardBadge(summary.results);

  return (
    <div className="card flex flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-[var(--border-light)] border-b p-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
          <Icon className="h-4.5 w-4.5" style={{ color: cfg.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{cfg.label}</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          {summary.lastRun && (
            <p className="mt-0.5 text-[var(--text-muted)] text-xs">
              Terakhir dites {new Date(summary.lastRun).toLocaleString("id-ID")}
            </p>
          )}
        </div>
      </div>

      {/* Hasil check */}
      <div className="flex-1 px-4">
        {summary.results && summary.results.length > 0 ? (
          <ul className="divide-y divide-[var(--border-light)]">
            {summary.results.map((r) => (
              <ResultRow key={r.name} result={r} />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-[var(--text-muted)] text-sm">
            Belum ada hasil. Jalankan tes untuk memverifikasi konfigurasi platform ini.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-[var(--border-light)] border-t px-4 py-3">
        <Button
          size="sm"
          disabled={running}
          onClick={() => onRun(summary.platform)}
          className="bg-[var(--accent-gold)] text-white hover:bg-[var(--accent-gold)]/90"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Jalankan Tes
        </Button>
      </div>
    </div>
  );
}

export function AdminApiTestsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-api-tests"],
    queryFn: () => api.get<{ platforms: PlatformSummary[] }>("/admin/api-tests"),
  });

  const runTest = useMutation({
    mutationFn: (platform: string) =>
      api.post<{ platform: string; ranAt: string; results: TestResult[] }>(
        `/admin/api-tests/run/${platform}`,
      ),
    onSuccess: (res) => {
      // Update cache langsung agar hasil tampil tanpa refetch penuh
      queryClient.setQueryData<{ platforms: PlatformSummary[] }>(["admin-api-tests"], (old) =>
        old
          ? {
              platforms: old.platforms.map((p) =>
                p.platform === res.platform
                  ? { ...p, lastRun: res.ranAt, results: res.results }
                  : p,
              ),
            }
          : old,
      );
      const fail = res.results.filter((r) => r.status === "fail").length;
      if (fail > 0) {
        toast.error(`Tes ${res.platform}: ${fail} check gagal — lihat detail`);
      } else {
        toast.success(`Tes ${res.platform} selesai — semua check lolos`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const platforms = data?.platforms ?? [];
  const byPlatform = new Map(platforms.map((p) => [p.platform, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Tes API Platform</h1>
        <p className="mt-1 max-w-2xl text-[var(--text-secondary)] text-sm">
          Alat diagnostik untuk memverifikasi kredensial, token, dan endpoint API tiap platform
          sebelum mengajukan App Review. Hasil hanya menampilkan status & pesan — secret/token tidak
          pernah ditampilkan.
        </p>
      </div>

      {/* Catatan penggunaan */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-[var(--text-secondary)] text-sm">
            <p className="font-medium text-[var(--text-primary)]">
              Jalankan tes ini sebelum mengajukan App Review
            </p>
            <p className="mt-1">
              Pastikan semua check lolos (
              <span className="text-emerald-600 dark:text-emerald-400">hijau</span>) sebelum submit.
              Check <span className="text-amber-600 dark:text-amber-400">kuning</span> boleh
              dilanjutkan bila memang belum relevan (mis. belum ada akun terhubung).
            </p>
          </div>
        </div>
      </div>

      {/* Platform cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {TESTABLE_PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform}
            summary={
              byPlatform.get(platform) ?? {
                platform,
                lastRun: null,
                results: null,
              }
            }
            onRun={(p) => runTest.mutate(p)}
            running={runTest.isPending && runTest.variables === platform}
          />
        ))}
      </div>
    </div>
  );
}
