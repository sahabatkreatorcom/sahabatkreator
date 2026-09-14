// Panel UTM Builder — generate link tracking & terapkan ke URL di caption.
// Template tersimpan per org (utm_template) untuk kampanye berulang.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { applyUtmToCaption, buildUtmUrl, findUrls, type UtmParams } from "@/lib/utm";

type UtmTemplate = {
  id: string;
  name: string;
  source: string;
  medium: string;
  campaign: string;
  term: string | null;
  content: string | null;
  usageCount: number;
};

const UTM_SOURCES = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "linkedin",
  "youtube",
  "threads",
  "pinterest",
];
const UTM_MEDIUMS = ["social", "social-organic", "bio", "story", "reel", "email", "ads"];

export function UtmPanel({
  content,
  onApplyContent,
}: {
  content: string;
  onApplyContent: (newContent: string) => void;
}) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("");
  const [params, setParams] = useState<UtmParams>({
    source: "instagram",
    medium: "social",
    campaign: "",
    term: "",
    content: "",
  });
  const [showSave, setShowSave] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // URL terdeteksi di caption — bisa dipakai sebagai base otomatis
  const captionUrls = useMemo(() => findUrls(content), [content]);

  const { data: templatesData } = useQuery({
    queryKey: ["utm-templates"],
    queryFn: () => api.get<{ templates: UtmTemplate[] }>("/strategy/utm-templates"),
  });
  const templates = templatesData?.templates ?? [];

  const effectiveBase = baseUrl || captionUrls[0] || "";
  const utmUrl = useMemo(() => {
    if (!effectiveBase || !params.source || !params.medium || !params.campaign) return null;
    return buildUtmUrl(effectiveBase, params);
  }, [effectiveBase, params]);

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.post<{ template: UtmTemplate }>("/strategy/utm-templates", {
        name: templateName,
        source: params.source,
        medium: params.medium,
        campaign: params.campaign,
        term: params.term || null,
        content: params.content || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utm-templates"] });
      setShowSave(false);
      setTemplateName("");
      toast.success("Template UTM tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/strategy/utm-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["utm-templates"] });
      toast.success("Template dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleApply() {
    if (!utmUrl) {
      toast.error("Lengkapi URL, source, medium, dan campaign");
      return;
    }
    if (captionUrls.length > 0 && effectiveBase === captionUrls[0]) {
      // Ganti URL pertama di caption dengan versi ber-UTM
      const newContent = applyUtmToCaption(content, captionUrls[0]!, utmUrl);
      onApplyContent(newContent);
      toast.success("Link UTM diterapkan ke caption");
    } else {
      // Tambahkan link ber-UTM ke akhir caption
      onApplyContent(`${content.trimEnd()}\n\n${utmUrl}`);
      toast.success("Link UTM ditambahkan ke caption");
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Link2 className="h-4 w-4 text-[var(--accent-gold)]" />
        UTM Builder
      </h2>
      <p className="text-[var(--text-secondary)] text-xs">
        Lacak dari mana pengunjung website Anda datang. Hasil terlihat di Google Analytics.
      </p>

      {/* Template tersimpan */}
      {templates.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Template tersimpan</Label>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span
                key={t.id}
                className="group flex items-center gap-1 rounded-full border border-[var(--border)] pr-1 pl-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => {
                    setParams({
                      source: t.source,
                      medium: t.medium,
                      campaign: t.campaign,
                      term: t.term ?? "",
                      content: t.content ?? "",
                    });
                    api
                      .post(`/strategy/utm-templates/${t.id}/use`)
                      .then(() => queryClient.invalidateQueries({ queryKey: ["utm-templates"] }))
                      .catch(() => {});
                    toast.success(`Template "${t.name}" diterapkan`);
                  }}
                  className="py-1 hover:text-[var(--accent-gold)]"
                >
                  {t.name}
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">×{t.usageCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate.mutate(t.id)}
                  className="rounded-full p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  aria-label={`Hapus ${t.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Base URL */}
      <div className="space-y-2">
        <Label htmlFor="utm-base">URL Website / Landing Page</Label>
        <Input
          id="utm-base"
          placeholder="tokosaya.com/promo"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        {captionUrls.length > 0 && !baseUrl && (
          <button
            type="button"
            onClick={() => setBaseUrl(captionUrls[0]!)}
            className="text-left text-[var(--accent-gold)] text-xs hover:underline"
          >
            Pakai URL dari caption: {captionUrls[0]}
          </button>
        )}
      </div>

      {/* Parameter UTM */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="utm-source" className="text-xs">
            Source *
          </Label>
          <Input
            id="utm-source"
            list="utm-sources"
            value={params.source}
            onChange={(e) => setParams((p) => ({ ...p, source: e.target.value }))}
          />
          <datalist id="utm-sources">
            {UTM_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="utm-medium" className="text-xs">
            Medium *
          </Label>
          <Input
            id="utm-medium"
            list="utm-mediums"
            value={params.medium}
            onChange={(e) => setParams((p) => ({ ...p, medium: e.target.value }))}
          />
          <datalist id="utm-mediums">
            {UTM_MEDIUMS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="utm-campaign" className="text-xs">
            Campaign *
          </Label>
          <Input
            id="utm-campaign"
            placeholder="promo-ramadan"
            value={params.campaign}
            onChange={(e) => setParams((p) => ({ ...p, campaign: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="utm-term" className="text-xs">
            Term
          </Label>
          <Input
            id="utm-term"
            placeholder="(opsional)"
            value={params.term}
            onChange={(e) => setParams((p) => ({ ...p, term: e.target.value }))}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="utm-content" className="text-xs">
            Content
          </Label>
          <Input
            id="utm-content"
            placeholder="variasi-A (opsional)"
            value={params.content}
            onChange={(e) => setParams((p) => ({ ...p, content: e.target.value }))}
          />
        </div>
      </div>

      {/* Preview */}
      {utmUrl && (
        <div className="space-y-1">
          <Label className="text-xs">Hasil</Label>
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-2">
            <code className="min-w-0 flex-1 break-all text-[11px]">{utmUrl}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(utmUrl);
                toast.success("Link disalin");
              }}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent-gold)]"
              aria-label="Salin link"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Aksi */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleApply} disabled={!utmUrl}>
          <Link2 className="h-3.5 w-3.5" />
          Terapkan ke Caption
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowSave((s) => !s)}
          disabled={!params.campaign}
        >
          <Plus className="h-3.5 w-3.5" />
          Simpan Template
        </Button>
      </div>

      {showSave && (
        <div className="flex gap-2">
          <Input
            placeholder="Nama template, mis. Promo Ramadan IG"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => templateName && saveTemplate.mutate()}
            disabled={saveTemplate.isPending || !templateName}
          >
            {saveTemplate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Simpan
          </Button>
        </div>
      )}

      {captionUrls.length === 0 && !baseUrl && (
        <Badge variant="secondary" className="text-[10px]">
          Tip: tulis URL di caption dulu, nanti otomatis terdeteksi
        </Badge>
      )}
    </div>
  );
}
