// Halaman Pricing — tabel perbandingan paket (desktop) + kartu bertumpuk (mobile).
// Interval toggle 1/12 bulan; logic & row bersama di pricing-shared.ts.
import type { FeatureKey } from "@sahabatkreator/db";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { FEATURE_CATALOG, GLOBAL_FEATURES } from "@/lib/feature-catalog";
import { useSeo } from "@/lib/seo";
import { queryKeys } from "../../lib/query-keys";
import {
  annualSavings,
  annualToggleLabel,
  type Cell,
  CREDIT_ROWS,
  ctaFor,
  featureRows,
  HIGHLIGHT_TIER,
  LIMIT_ROWS,
  type Plan,
  priceLabel,
  priceSuffix,
  type Row,
  SECTION_CREDITS,
  SECTION_FEATURES,
  SECTION_LIMITS,
  sharedFeatureKeys,
  TIER_LABEL,
  TIER_ORDER,
} from "./pricing-shared";

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === "check") {
    return <Check className="mx-auto h-4 w-4 text-[var(--accent-gold)]" aria-label="Termasuk" />;
  }
  if (cell.kind === "cross") {
    return (
      <X
        className="mx-auto h-4 w-4 text-[var(--text-muted)] opacity-50"
        aria-label="Tidak termasuk"
      />
    );
  }
  return <span className="font-medium">{cell.text}</span>;
}

function SectionHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="bg-[var(--bg-tertiary)] px-4 py-2.5 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider"
      >
        {label}
      </td>
    </tr>
  );
}

function TableRow({ row, plans }: { row: Row; plans: Plan[] }) {
  const cells = row.cells(plans);
  return (
    <tr className="border-[var(--border)] border-b">
      <td className="px-4 py-3 text-[var(--text-secondary)]">{row.label}</td>
      {cells.map((cell, i) => (
        <td key={i} className="px-4 py-3 text-center">
          <CellView cell={cell} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Kartu "Semua paket dapat" — fitur yang tidak membedakan paket.
 *
 * Isinya dua sumber yang berbeda dan sengaja dipisah:
 * 1. key katalog yang dimiliki SETIAP paket (dihitung dari data plan, jadi
 *    admin cukup ubah /admin/plans — lihat sharedFeatureKeys), dan
 * 2. GLOBAL_FEATURES, fitur tanpa gate yang tidak pernah ada di plan.features.
 *
 * Tujuannya menghapus baris ✓✓✓✓ dari tabel perbandingan: baris seperti itu
 * memakan ruang tapi tidak memberi informasi pilihan apa pun.
 */
function SharedFeaturesCard({ items }: { items: { label: string; hint: string }[] }) {
  return (
    <div className="card mb-8 p-6 md:p-8">
      <div className="mb-5 text-center">
        <h2 className="font-bold text-xl">Semua paket dapat</h2>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Sudah termasuk di paket Gratis — tidak perlu upgrade.
        </p>
      </div>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
            <div>
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-[var(--text-muted)] text-xs">{item.hint}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kartu paket untuk mobile — fitur ditampilkan hanya yang termasuk. */
function MobilePlanCard({
  tier,
  plan,
  monthly,
  interval,
  exclude,
}: {
  tier: string;
  plan: Plan;
  monthly: Plan;
  interval: 1 | 12;
  /** Fitur yang sudah tampil di kartu "Semua paket dapat" — jangan diulang. */
  exclude: FeatureKey[];
}) {
  const hl = tier === HIGHLIGHT_TIER;
  const link = ctaFor(tier);
  const includedFeatures = featureRows([monthly], exclude)
    .filter((r) => r.cells([monthly])[0]?.kind === "check")
    .map((r) => r.label);

  const sections = [
    { label: SECTION_LIMITS, rows: LIMIT_ROWS },
    { label: SECTION_CREDITS, rows: CREDIT_ROWS },
  ];

  return (
    <div className={`card p-5 ${hl ? "border-2 border-[var(--accent-gold)] shadow-lg" : ""}`}>
      {hl && (
        <Badge variant="primary" className="mb-3 w-full justify-center py-1">
          Paling Populer
        </Badge>
      )}
      <div className="text-center">
        <div className={`font-bold text-lg ${hl ? "" : "text-[var(--text-secondary)]"}`}>
          {TIER_LABEL[tier] ?? plan.name}
        </div>
        <div className="mt-1 font-bold text-3xl">{priceLabel(plan)}</div>
        {priceSuffix(plan, interval) && (
          <div className="text-[var(--text-muted)] text-xs">{priceSuffix(plan, interval)}</div>
        )}
        {interval === 12 && annualSavings(plan, monthly) && (
          <div className="mt-1 font-medium text-[var(--accent-gold)] text-xs">
            {annualSavings(plan, monthly)}
          </div>
        )}
        <div className="mt-4">
          <Link to={link.to}>
            <Button className="w-full" variant={hl ? "primary" : "outline"}>
              {link.label}
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {sections.map((sec) => (
          <div key={sec.label}>
            <div className="rounded-t-[var(--radius-md)] bg-[var(--bg-tertiary)] px-3 py-1.5 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
              {sec.label}
            </div>
            {sec.rows.map((row) => {
              const cell = row.cells([plan])[0];
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-[var(--border)] border-b px-1 py-2 text-sm"
                >
                  <span className="text-[var(--text-secondary)]">{row.label}</span>
                  <span className="text-right">
                    <CellView cell={cell} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        <div>
          <div className="rounded-t-[var(--radius-md)] bg-[var(--bg-tertiary)] px-3 py-1.5 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
            {SECTION_FEATURES}
          </div>
          {includedFeatures.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {includedFeatures.map((label) => (
                <li key={label} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
                  {label}
                </li>
              ))}
            </ul>
          ) : exclude.length > 0 ? (
            // Paket ini tidak punya fitur pembeda (mis. Gratis: semua fiturnya
            // juga dimiliki tier atas) — jangan tampilkan "—" yang terbaca
            // seperti tidak dapat fitur apa pun.
            <p className="mt-2 text-[var(--text-muted)] text-sm">
              Semua fitur inti sudah termasuk — lihat "Semua paket dapat" di atas.
            </p>
          ) : (
            <p className="mt-2 text-[var(--text-muted)] text-sm">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PricingPage() {
  const [interval, setInterval] = useState<1 | 12>(1);

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.plans, "allIntervals"],
    queryFn: () => api.get<{ plans: Plan[] }>("/billing/plans?allIntervals=1"),
  });

  const allPlans = data?.plans ?? [];

  // Satu kolom per tier; plan sesuai interval terpilih (fallback plan pertama tier).
  const tiers: { tier: string; plan: Plan; monthly: Plan }[] = [];
  for (const tier of TIER_ORDER) {
    const list = allPlans.filter((p) => p.tier === tier);
    if (list.length === 0) continue;
    const plan = list.find((p) => p.billingIntervalMonths === interval) ?? list[0];
    const monthly = list.find((p) => p.billingIntervalMonths === 1) ?? list[0];
    tiers.push({ tier, plan, monthly });
  }

  // Badge toggle tahunan dihitung dari data plan — tidak boleh hard-code
  // "Hemat 2 bulan" karena harga editable admin (lihat annualToggleLabel).
  const annualBadge = annualToggleLabel(tiers);

  // Angka FAQ diambil dari paket Gratis yang benar-benar aktif di DB, supaya
  // JSON-LD tidak berbohong saat admin mengubah limit lewat /admin/plans.
  const freePlan = allPlans.find((p) => p.tier === "free" && p.billingIntervalMonths === 1);
  const freeFaqText = freePlan
    ? `Ya, paket Gratis bisa dipakai selamanya dengan ${freePlan.maxSocialAccounts} akun sosial media, ${freePlan.maxScheduledPostsPerMonth} post terjadwal per bulan, dan ${freePlan.renderCreditsPerMonth} kredit render per bulan.`
    : "Ya, paket Gratis bisa dipakai selamanya untuk memulai — tanpa kartu kredit.";

  useSeo({
    title: "Harga — Paket untuk Semua Kebutuhan",
    description:
      "Pilih paket Sahabat Kreator sesuai kebutuhan. Mulai gratis, upgrade kapan saja. Pembayaran QRIS dan transfer bank Indonesia.",
    path: "/harga",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Apakah ada paket gratis?",
          acceptedAnswer: {
            "@type": "Answer",
            text: freeFaqText,
          },
        },
        {
          "@type": "Question",
          name: "Metode pembayaran apa yang didukung?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Kami mendukung pembayaran QRIS dan transfer virtual account dari semua bank besar di Indonesia.",
          },
        },
      ],
    },
  });

  const plans = tiers.map((t) => t.plan);
  const featureSource = tiers.map((t) => t.monthly);

  // Fitur yang sama di semua paket pindah ke kartu "Semua paket dapat",
  // sisanya jadi baris pembanding. Keduanya berasal dari satu perhitungan yang
  // sama supaya tidak ada fitur yang hilang atau tampil dua kali.
  const sharedKeys = sharedFeatureKeys(featureSource);
  const sharedKeySet = new Set<string>(sharedKeys);
  const sharedItems = [
    ...FEATURE_CATALOG.filter((f) => sharedKeySet.has(f.key)).map(({ label, hint }) => ({
      label,
      hint,
    })),
    ...GLOBAL_FEATURES.map(({ label, hint }) => ({ label, hint })),
  ];

  const rows: { section: string; row: Row }[] = [
    ...LIMIT_ROWS.map((row) => ({ section: SECTION_LIMITS, row })),
    ...CREDIT_ROWS.map((row) => ({ section: SECTION_CREDITS, row })),
    ...featureRows(featureSource, sharedKeys).map((row) => ({ section: SECTION_FEATURES, row })),
  ];
  const colSpan = plans.length + 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div className="mb-10 text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Harga <span className="text-gradient">transparan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)] text-lg">
          Mulai gratis dan upgrade saat Anda tumbuh. Fitur yang sudah termasuk di semua paket ada di
          bawah ini, sisanya bisa Anda bandingkan per paket.
        </p>
      </div>

      {/* Toggle interval */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)] p-1">
          {([1, 12] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`rounded-[var(--radius-md)] px-5 py-2 text-sm transition-colors ${
                interval === iv
                  ? "bg-[var(--bg-secondary)] font-semibold shadow"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {iv === 1 ? "1 Bulan" : "12 Bulan"}
              {iv === 12 && annualBadge && (
                <span className="ml-1.5 text-[var(--accent-gold)] text-xs">{annualBadge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : (
        <>
          {/* Kartu 1 — fitur yang sama di semua paket (di atas, sebelum pilihan
              paket: di mobile kartu paket bertumpuk tinggi, jadi kartu ini tidak
              akan pernah terlihat kalau diletakkan di bawah). */}
          {sharedItems.length > 0 && <SharedFeaturesCard items={sharedItems} />}

          {/* Kartu 2 (mobile) — kartu paket bertumpuk, fitur pembeda saja */}
          <div className="space-y-5 md:hidden">
            {tiers.map(({ tier, plan, monthly }) => (
              <MobilePlanCard
                key={tier}
                tier={tier}
                plan={plan}
                monthly={monthly}
                interval={interval}
                exclude={sharedKeys}
              />
            ))}
          </div>

          {/* Desktop — tabel perbandingan */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-64 px-4 py-6 text-left align-bottom font-semibold text-base">
                    Bandingkan Paket
                  </th>
                  {tiers.map(({ tier, plan, monthly }) => {
                    const hl = tier === HIGHLIGHT_TIER;
                    const link = ctaFor(tier);
                    return (
                      <th
                        key={tier}
                        className={`px-4 py-6 text-center align-bottom ${
                          hl ? "border-[var(--accent-gold)] border-x-2 bg-[var(--bg-tertiary)]" : ""
                        }`}
                      >
                        {hl && (
                          <div className="mb-3 flex justify-center">
                            <Badge variant="primary">Paling Populer</Badge>
                          </div>
                        )}
                        <div
                          className={`font-bold text-lg ${hl ? "" : "text-[var(--text-secondary)]"}`}
                        >
                          {TIER_LABEL[tier] ?? plan.name}
                        </div>
                        <div className="mt-2 font-bold text-3xl">{priceLabel(plan)}</div>
                        {priceSuffix(plan, interval) && (
                          <div className="text-[var(--text-muted)] text-xs">
                            {priceSuffix(plan, interval)}
                          </div>
                        )}
                        {interval === 12 && annualSavings(plan, monthly) && (
                          <div className="mt-1 font-medium text-[var(--accent-gold)] text-xs">
                            {annualSavings(plan, monthly)}
                          </div>
                        )}
                        <div className="mt-4">
                          <Link to={link.to}>
                            <Button
                              className="w-full min-w-36"
                              variant={hl ? "primary" : "outline"}
                            >
                              {link.label}
                            </Button>
                          </Link>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ section, row }, i) => {
                  const showSection = i === 0 || rows[i - 1].section !== section;
                  return (
                    <Fragment key={`${section}-${row.label}`}>
                      {showSection && <SectionHeader label={section} colSpan={colSpan} />}
                      <TableRow row={row} plans={plans} />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-16 text-center text-[var(--text-muted)] text-sm">
        <p>
          Butuh paket khusus, volume besar, atau pertanyaan lain?{" "}
          <Link to="/kontak" className="text-[var(--accent-gold)] underline">
            Hubungi kami
          </Link>
        </p>
      </div>
    </div>
  );
}
