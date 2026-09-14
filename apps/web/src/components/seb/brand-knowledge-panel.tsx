// Panel brand knowledge SEB — form field manual + scan website AI + approval pending insights
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, ScanSearch, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SebBrandKnowledge } from "./types";

const FIELDS = [
  { key: "audience", label: "Target audiens", placeholder: "Siapa yang Anda ingin jangkau?" },
  { key: "positioning", label: "Positioning", placeholder: "Apa yang membuat brand unik?" },
  { key: "products", label: "Produk / layanan", placeholder: "Apa yang Anda jual?" },
  { key: "offers", label: "Penawaran khusus", placeholder: "Promo / diskon saat ini" },
  {
    key: "voiceRules",
    label: "Aturan tone of voice",
    placeholder: "Gaya bahasa yang harus dipakai",
  },
  { key: "bannedTopics", label: "Topik terlarang", placeholder: "Topik yang tidak boleh dibahas" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function BrandKnowledgePanel({
  brandKnowledge,
  canManage,
}: {
  brandKnowledge: SebBrandKnowledge | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    audience: "",
    positioning: "",
    products: "",
    offers: "",
    voiceRules: "",
    bannedTopics: "",
  });
  const [websiteUrl, setWebsiteUrl] = useState("");

  useEffect(() => {
    setValues({
      audience: brandKnowledge?.audience ?? "",
      positioning: brandKnowledge?.positioning ?? "",
      products: brandKnowledge?.products ?? "",
      offers: brandKnowledge?.offers ?? "",
      voiceRules: brandKnowledge?.voiceRules ?? "",
      bannedTopics: brandKnowledge?.bannedTopics ?? "",
    });
    setWebsiteUrl(brandKnowledge?.websiteUrl ?? "");
  }, [brandKnowledge]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["seb-overview"] });

  const save = useMutation({
    mutationFn: () =>
      api.put<{ brandKnowledge: SebBrandKnowledge }>("/seb/brand-knowledge", {
        ...values,
        websiteUrl: websiteUrl.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Brand knowledge tersimpan");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scan = useMutation({
    mutationFn: () =>
      api.post<{ scannedPages: number }>("/seb/brand-knowledge/scan-website", {
        websiteUrl: websiteUrl.trim(),
      }),
    onSuccess: (res) => {
      toast.success(
        `Scan selesai (${res.scannedPages} halaman) — cek insight yang menunggu persetujuan`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (fields: Record<string, boolean>) =>
      api.post<{ brandKnowledge: SebBrandKnowledge }>("/seb/brand-knowledge/approve", fields),
    onSuccess: () => {
      toast.success("Insight disetujui");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = brandKnowledge?.pendingInsights;
  const pendingEntries = Object.entries(pending ?? {}).filter(
    ([key, value]) =>
      key !== "source" &&
      key !== "generatedAt" &&
      key !== "crawlSummary" &&
      key !== "confidence" &&
      value != null,
  );

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-lg">
        <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
        Brand Knowledge
      </h2>
      <p className="text-[var(--text-secondary)] text-sm">
        Pengetahuan brand yang dipakai SEB saat menganalisis dan menjawab chat. Bisa diisi manual
        atau hasil scan website otomatis.
      </p>

      {/* Scan website */}
      {canManage && (
        <div className="card space-y-3 p-4">
          <span className="flex items-center gap-2 font-semibold text-sm">
            <Globe className="h-4 w-4 text-[var(--accent-gold)]" />
            Scan website brand
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://tokokamu.com"
              className="input flex-1"
            />
            <Button
              variant="outline"
              disabled={!websiteUrl.trim() || scan.isPending}
              onClick={() => scan.mutate()}
            >
              {scan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="h-4 w-4" />
              )}
              Scan
            </Button>
          </div>
          <p className="text-[var(--text-muted)] text-xs">
            SEB membaca maksimal 5 halaman website lalu menyarankan insight — Anda yang menyetujui
            sebelum dipakai.
          </p>
        </div>
      )}

      {/* Pending insights hasil scan/report AI */}
      {pendingEntries.length > 0 && (
        <div className="card space-y-3 border-[var(--accent-gold)] p-4">
          <p className="font-semibold text-sm">Insight menunggu persetujuan</p>
          {pendingEntries.map(([key, value]) => {
            const field = FIELDS.find((f) => f.key === key);
            if (!field) return null;
            return (
              <div
                key={key}
                className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
              >
                <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                  {field.label}
                </p>
                <p className="mt-1 text-sm">
                  {Array.isArray(value) ? value.join(" • ") : String(value)}
                </p>
                {canManage && (
                  <button
                    type="button"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ [key]: true })}
                    className="mt-2 rounded-[var(--radius-md)] border border-[var(--accent-gold)] px-2.5 py-1 font-medium text-[var(--accent-gold)] text-xs transition-colors hover:bg-[var(--accent-gold-light)]"
                  >
                    Setujui
                  </button>
                )}
              </div>
            );
          })}
          {canManage && (
            <button
              type="button"
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate({
                  audience: true,
                  positioning: true,
                  products: true,
                  offers: true,
                  voiceRules: true,
                  bannedTopics: true,
                  learnedInsights: true,
                })
              }
              className="rounded-[var(--radius-md)] border border-[var(--accent-gold)] px-3 py-1.5 font-medium text-[var(--accent-gold)] text-xs transition-colors hover:bg-[var(--accent-gold-light)]"
            >
              Setujui semua
            </button>
          )}
        </div>
      )}

      {/* Form manual */}
      <div className="card space-y-4 p-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`bk-${field.key}`}
              className="font-medium text-[var(--text-secondary)] text-xs"
            >
              {field.label}
            </label>
            <textarea
              id={`bk-${field.key}`}
              value={values[field.key]}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              rows={2}
              maxLength={2000}
              placeholder={field.placeholder}
              className="input mt-1 w-full resize-none"
            />
          </div>
        ))}
        {canManage && (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        )}
      </div>

      {/* Learned insights */}
      {(brandKnowledge?.learnedInsights?.length ?? 0) > 0 && (
        <div className="card p-4">
          <p className="font-semibold text-sm">Insight terpelajari</p>
          <ul className="mt-2 space-y-1">
            {brandKnowledge?.learnedInsights.map((insight, i) => (
              <li key={i} className="text-[var(--text-secondary)] text-sm">
                • {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
