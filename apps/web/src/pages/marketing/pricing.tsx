// Halaman Pricing — tabel perbandingan paket (desktop) + kartu bertumpuk (mobile).
// Interval toggle 1/12 bulan; logic & row bersama di pricing-shared.ts.
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { queryKeys } from "../../lib/query-keys";
import {
  annualSavings,
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

/** Kartu paket untuk mobile — fitur ditampilkan hanya yang termasuk. */
function MobilePlanCard({
  tier,
  plan,
  monthly,
  interval,
}: {
  tier: string;
  plan: Plan;
  monthly: Plan;
  interval: 1 | 12;
}) {
  const hl = tier === HIGHLIGHT_TIER;
  const link = ctaFor(tier);
  const includedFeatures = featureRows([monthly])
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
            text: "Ya, paket Gratis bisa dipakai selamanya dengan 1 akun sosial media, 10 post terjadwal per bulan, dan 50 kredit render per bulan.",
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

  const plans = tiers.map((t) => t.plan);
  const featureSource = tiers.map((t) => t.monthly);
  const rows: { section: string; row: Row }[] = [
    ...LIMIT_ROWS.map((row) => ({ section: SECTION_LIMITS, row })),
    ...CREDIT_ROWS.map((row) => ({ section: SECTION_CREDITS, row })),
    ...featureRows(featureSource).map((row) => ({ section: SECTION_FEATURES, row })),
  ];
  const colSpan = plans.length + 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div className="mb-10 text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Harga <span className="text-gradient">transparan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)] text-lg">
          Mulai gratis dan upgrade saat Anda tumbuh. Bandingkan semua paket dalam satu tabel.
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
              {iv === 12 && (
                <span className="ml-1.5 text-[var(--accent-gold)] text-xs">Hemat 2 bulan</span>
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
          {/* Mobile — kartu bertumpuk */}
          <div className="space-y-5 md:hidden">
            {tiers.map(({ tier, plan, monthly }) => (
              <MobilePlanCard
                key={tier}
                tier={tier}
                plan={plan}
                monthly={monthly}
                interval={interval}
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
          Pembayaran via QRIS & virtual account. Semua paket berbayar termasuk semua fitur inti.
          Butuh paket khusus?{" "}
          <Link to="/kontak" className="text-[var(--accent-gold)] underline">
            Hubungi kami
          </Link>
        </p>
      </div>
    </div>
  );
}
