// Panel Demografi Audiens — data gender × usia dari IG Insights / FB Page Insights
// (murni CSS bar)
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";

type Demographics = {
  /** Format lama (gender × usia). Kosong bila platform hanya kirim breakdown terpisah. */
  genderAge: { key: string; value: number }[];
  byGender: { gender: "F" | "M"; value: number }[];
  /** Breakdown usia terpisah (follower_demographics; tanpa cross-tab gender) */
  byAge?: { key: string; value: number }[];
  source: string;
  username: string;
  /** Catatan saat platform menolak permintaan (metric deprecated/audiens kurang) */
  notice?: string;
};

type Account = {
  id: string;
  platform: string;
  username: string;
};

/** Warna bar per gender — F = pink/oranye accent, M = biru accent */
const GENDER_COLOR: Record<string, string> = {
  F: "#FD9501", // accent gold/oranye
  M: "#08A5FC", // accent blue
};

const GENDER_LABEL: Record<string, string> = {
  F: "Wanita",
  M: "Pria",
};

export function AudienceDemographicsPanel({ accounts }: { accounts: Account[] }) {
  const supportedAccounts = accounts.filter(
    (a) =>
      a.platform === "instagram" ||
      a.platform === "instagram_standalone" ||
      a.platform === "facebook",
  );
  const [accountId, setAccountId] = useState<string>("");
  // Default: utamakan Instagram (data lebih lengkap); Facebook hanya bila tak ada IG.
  // Dihitung efektif agar tetap benar saat daftar akun baru selesai dimuat async.
  const selected =
    supportedAccounts.find((a) => a.id === accountId) ??
    supportedAccounts.find((a) => a.platform !== "facebook") ??
    supportedAccounts[0];
  const effectiveId = selected?.id ?? "";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics-demographics", effectiveId],
    queryFn: () => api.get<Demographics>(`/analytics/demographics?accountId=${effectiveId}`),
    enabled: !!effectiveId,
    retry: false,
  });

  // Agregasi per kelompok usia (gabung F+M per range usia untuk bar horizontal)
  const ageGroups = new Map<string, { F: number; M: number }>();
  for (const row of data?.genderAge ?? []) {
    const [gender, ...ageParts] = row.key.split(".");
    const age = ageParts.join(".");
    if (!age) continue;
    const group = ageGroups.get(age) ?? { F: 0, M: 0 };
    if (gender === "F" || gender === "M") group[gender] += row.value;
    ageGroups.set(age, group);
  }
  const hasCrossAge = ageGroups.size > 0;
  // Breakdown usia terpisah (follower_demographics) — dipakai bila cross-tab kosong
  const byAge = data?.byAge ?? [];
  const maxAgeTotal = hasCrossAge
    ? Math.max(1, ...[...ageGroups.values()].map((g) => g.F + g.M))
    : Math.max(1, ...byAge.map((a) => a.value));
  const hasData = hasCrossAge || byAge.length > 0;
  const grandTotal = (data?.byGender ?? []).reduce((s, g) => s + g.value, 0);

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--accent-gold)]" />
          <h2 className="font-semibold">Demografi Audiens</h2>
        </div>
        {supportedAccounts.length > 0 && (
          <select
            value={effectiveId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
            aria-label="Pilih akun"
          >
            {supportedAccounts.map((a) => {
              const cfg = PLATFORMS[a.platform as keyof typeof PLATFORMS];
              return (
                <option key={a.id} value={a.id}>
                  @{a.username} · {cfg?.label ?? a.platform}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {supportedAccounts.length === 0 ? (
        <EmptyState
          title="Belum ada akun Instagram/Facebook"
          description="Demografi audiens tersedia untuk akun Instagram Bisnis atau Halaman Facebook yang terhubung."
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-[var(--error)] text-sm">
          {(error as Error).message || "Gagal memuat demografi audiens"}
        </p>
      ) : !data || !hasData ? (
        <div className="space-y-2">
          <EmptyState
            title="Data belum tersedia"
            description="Platform belum mengirim data demografi untuk akun ini (butuh audiens minimum). Coba lagi nanti."
          />
          {data?.notice && (
            <p className="break-words text-[11px] text-[var(--text-muted)]">{data.notice}</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Ringkasan per gender */}
          <div className="flex flex-wrap gap-3">
            {data.byGender.map((g) => {
              const pct = grandTotal > 0 ? Math.round((g.value / grandTotal) * 100) : 0;
              return (
                <div
                  key={g.gender}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: GENDER_COLOR[g.gender] }}
                  />
                  <div>
                    <p className="text-[var(--text-muted)] text-xs">
                      {GENDER_LABEL[g.gender]} (@{data.username})
                    </p>
                    <p className="font-semibold text-sm">
                      {formatCompact(g.value)} · {pct}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bar horizontal — format lama: per usia × gender (stacked).
              Format baru (follower_demographics): per kelompok usia (satu warna). */}
          <div className="space-y-2.5">
            {hasCrossAge
              ? [...ageGroups.entries()]
                  .sort((a, b) => b[1].F + b[1].M - (a[1].F + a[1].M))
                  .map(([age, counts]) => {
                    const total = counts.F + counts.M;
                    const pct = (total / maxAgeTotal) * 100;
                    const fShare = total > 0 ? (counts.F / total) * 100 : 0;
                    const mShare = 100 - fShare;
                    return (
                      <div key={age} className="flex items-center gap-3">
                        <span className="w-14 shrink-0 text-right text-[var(--text-secondary)] text-xs">
                          {age}
                        </span>
                        <div
                          className="h-6 flex-1 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
                          style={{ maxWidth: `${Math.max(pct, 2)}%` }}
                        >
                          <div className="flex h-full w-full">
                            {counts.F > 0 && (
                              <div
                                className="h-full"
                                style={{ width: `${fShare}%`, backgroundColor: GENDER_COLOR.F }}
                                title={`${GENDER_LABEL.F}: ${formatCompact(counts.F)}`}
                              />
                            )}
                            {counts.M > 0 && (
                              <div
                                className="h-full"
                                style={{ width: `${mShare}%`, backgroundColor: GENDER_COLOR.M }}
                                title={`${GENDER_LABEL.M}: ${formatCompact(counts.M)}`}
                              />
                            )}
                          </div>
                        </div>
                        <span className="w-16 shrink-0 font-medium text-xs">
                          {formatCompact(total)}
                        </span>
                      </div>
                    );
                  })
              : byAge.map((row) => {
                  const pct = (row.value / maxAgeTotal) * 100;
                  return (
                    <div key={row.key} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-right text-[var(--text-secondary)] text-xs">
                        {row.key}
                      </span>
                      <div
                        className="h-6 flex-1 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
                        style={{ maxWidth: `${Math.max(pct, 2)}%` }}
                      >
                        <div
                          className="h-full w-full"
                          style={{ backgroundColor: GENDER_COLOR.F }}
                          title={`${row.key}: ${formatCompact(row.value)}`}
                        />
                      </div>
                      <span className="w-16 shrink-0 font-medium text-xs">
                        {formatCompact(row.value)}
                      </span>
                    </div>
                  );
                })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
            {(["F", "M"] as const).map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: GENDER_COLOR[g] }}
                />
                {GENDER_LABEL[g]}
              </span>
            ))}
            <span>
              Sumber: {PLATFORMS[data.source as keyof typeof PLATFORMS]?.label ?? data.source}{" "}
              Insights (@{data.username || selected?.username})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
