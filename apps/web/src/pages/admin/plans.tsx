// Admin: Paket & Harga — CRUD plan (upsert by tier)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type Plan = {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  priceIdr: number;
  billingIntervalMonths: number;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
  features: string[] | null;
  isActive: boolean;
  sortOrder: number;
};

const TIERS = ["free", "pro", "business", "enterprise"] as const;

/** Katalog fitur nyata yang berjalan di aplikasi — dipakai sebagai opsi multi-select plan.
 *  Value = limit praktis per tier (di-adjust via field angka di form, ini hanya label marketing). */
const FEATURE_CATALOG: { key: string; label: string; hint: string }[] = [
  {
    key: "multi_platform",
    label: "Publish multi-platform",
    hint: "IG, FB, Threads, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, GBP",
  },
  {
    key: "scheduling",
    label: "Penjadwalan & antrian post",
    hint: "Kalender + antrian + retry otomatis",
  },
  { key: "story", label: "Instagram Story", hint: "Publish story dengan rasio 9:16" },
  {
    key: "engagement_inbox",
    label: "Inbox engagement",
    hint: "Komentar, mention, DM, review, collab",
  },
  {
    key: "ai_caption",
    label: "AI caption & hashtag",
    hint: "Generate caption/rewrite/hashtag via kredit AI",
  },
  { key: "ai_coach", label: "Coach AI mingguan", hint: "Analisa performa + saran strategi" },
  {
    key: "holiday_ideas",
    label: "Ide konten hari besar",
    hint: "Kalender hari besar Indonesia & internasional",
  },
  {
    key: "analytics",
    label: "Analitik multi-akun",
    hint: "Reach, engagement, followers, waktu optimal",
  },
  {
    key: "analytics_compare",
    label: "Analitik perbandingan periode",
    hint: "Dibanding periode sebelumnya",
  },
  { key: "reports_export", label: "Laporan CSV & PDF", hint: "Export + jadwal email laporan" },
  { key: "media_library", label: "Media library", hint: "Folder, import URL, alt text" },
  {
    key: "automation",
    label: "Automation rules",
    hint: "Auto-reply & auto-like berdasarkan trigger",
  },
  { key: "listening", label: "Social listening", hint: "Pantau kata kunci & brand mention" },
  { key: "competitors", label: "Analisa kompetitor", hint: "Pantau akun kompetitor" },
  { key: "team", label: "Tim & kolaborasi", hint: "Invite anggota dengan role" },
  { key: "products", label: "Katalog produk", hint: "Tag produk di konten" },
  { key: "api_access", label: "Akses API", hint: "Webhook & integrasi eksternal" },
  { key: "priority_support", label: "Support prioritas", hint: "Respons lebih cepat via WhatsApp" },
  {
    key: "onboarding_help",
    label: "Onboarding & pelatihan",
    hint: "Panduan setup akun + tour fitur",
  },
];

type PlanForm = {
  tier: string;
  name: string;
  description: string;
  priceIdr: string;
  maxSocialAccounts: string;
  maxScheduledPostsPerMonth: string;
  maxTeamMembers: string;
  maxMediaStorageMb: string;
  aiCreditsPerMonth: string;
  features: string;
  isActive: boolean;
  sortOrder: string;
};

const EMPTY_FORM: PlanForm = {
  tier: "free",
  name: "",
  description: "",
  priceIdr: "0",
  maxSocialAccounts: "2",
  maxScheduledPostsPerMonth: "15",
  maxTeamMembers: "1",
  maxMediaStorageMb: "500",
  aiCreditsPerMonth: "0",
  features: "",
  isActive: true,
  sortOrder: "0",
};

export function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api.get<{ plans: Plan[] }>("/admin/plans"),
  });

  useEffect(() => {
    if (editing) {
      setForm({
        tier: editing.tier,
        name: editing.name,
        description: editing.description ?? "",
        priceIdr: String(editing.priceIdr),
        maxSocialAccounts: String(editing.maxSocialAccounts),
        maxScheduledPostsPerMonth: String(editing.maxScheduledPostsPerMonth),
        maxTeamMembers: String(editing.maxTeamMembers),
        maxMediaStorageMb: String(editing.maxMediaStorageMb),
        aiCreditsPerMonth: String(editing.aiCreditsPerMonth),
        features: (editing.features ?? []).join(", "),
        isActive: editing.isActive,
        sortOrder: String(editing.sortOrder),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing]);

  const save = useMutation({
    mutationFn: () =>
      api.post("/admin/plans", {
        tier: form.tier,
        name: form.name,
        description: form.description || null,
        priceIdr: Number(form.priceIdr) || 0,
        billingIntervalMonths: 1,
        maxSocialAccounts: Number(form.maxSocialAccounts) || 0,
        maxScheduledPostsPerMonth: Number(form.maxScheduledPostsPerMonth) || 0,
        maxTeamMembers: Number(form.maxTeamMembers) || 1,
        maxMediaStorageMb: Number(form.maxMediaStorageMb) || 0,
        aiCreditsPerMonth: Number(form.aiCreditsPerMonth) || 0,
        features: form.features
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
          .slice(0, 20),
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Paket tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const plans = data?.plans ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Paket & Harga</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Kelola plan langganan. Perubahan harga berlaku untuk pembayaran baru.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daftar plan */}
        <div className="space-y-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setEditing(editing?.id === plan.id ? null : plan)}
              className={`card w-full p-5 text-left transition-colors ${
                editing?.id === plan.id
                  ? "border-[var(--accent-gold)]"
                  : "hover:border-[var(--accent-gold)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge variant={plan.isActive ? "success" : "secondary"}>
                    {plan.isActive ? "aktif" : "nonaktif"}
                  </Badge>
                </div>
                <span className="font-bold">Rp {plan.priceIdr.toLocaleString("id-ID")}</span>
              </div>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                {plan.maxSocialAccounts} akun · {plan.maxScheduledPostsPerMonth} post/bln ·{" "}
                {plan.maxTeamMembers} anggota · {plan.maxMediaStorageMb} MB
              </p>
              {plan.features && plan.features.length > 0 && (
                <p className="mt-1.5 line-clamp-2 text-[var(--text-secondary)] text-xs">
                  {plan.features
                    .map((k) => FEATURE_CATALOG.find((f) => f.key === k)?.label ?? k)
                    .join(" · ")}
                </p>
              )}
            </button>
          ))}
          {plans.length === 0 && (
            <p className="text-[var(--text-secondary)] text-sm">
              Belum ada plan. Buat plan pertama Anda di form sebelah kanan.
            </p>
          )}
        </div>

        {/* Form */}
        <form
          className="card space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Tag className="h-4 w-4" />
              {editing ? `Edit: ${editing.name}` : "Buat / Update Paket"}
            </h2>
            {editing && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Batal edit
              </Button>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-xs">
            Paket dengan tier yang sama akan di-update (bukan duplikat).
          </p>

          <div className="space-y-2">
            <Label>Tier</Label>
            <div className="grid grid-cols-4 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tier: t })}
                  className={`rounded-[var(--radius-md)] border px-2 py-2 text-xs capitalize ${
                    form.tier === t
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nama</Label>
              <Input
                id="plan-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-price">Harga (IDR/bln)</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                required
                value={form.priceIdr}
                onChange={(e) => setForm({ ...form, priceIdr: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-desc">Deskripsi</Label>
            <Input
              id="plan-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={300}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-accounts">Maks Akun Sosmed</Label>
              <Input
                id="plan-accounts"
                type="number"
                min={0}
                value={form.maxSocialAccounts}
                onChange={(e) => setForm({ ...form, maxSocialAccounts: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-posts">Maks Post/Bulan</Label>
              <Input
                id="plan-posts"
                type="number"
                min={0}
                value={form.maxScheduledPostsPerMonth}
                onChange={(e) => setForm({ ...form, maxScheduledPostsPerMonth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-members">Maks Anggota</Label>
              <Input
                id="plan-members"
                type="number"
                min={1}
                value={form.maxTeamMembers}
                onChange={(e) => setForm({ ...form, maxTeamMembers: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-storage">Storage (MB)</Label>
              <Input
                id="plan-storage"
                type="number"
                min={0}
                value={form.maxMediaStorageMb}
                onChange={(e) => setForm({ ...form, maxMediaStorageMb: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-ai">Kredit AI/Bulan</Label>
              <Input
                id="plan-ai"
                type="number"
                min={0}
                value={form.aiCreditsPerMonth}
                onChange={(e) => setForm({ ...form, aiCreditsPerMonth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-sort">Urutan</Label>
              <Input
                id="plan-sort"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
          </div>

          {/* Fitur — multi-select dari katalog fitur aplikasi (sesuai #10 note.md) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fitur yang aktif untuk paket ini</Label>
              <button
                type="button"
                className="text-[var(--accent-gold)] text-xs hover:underline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    features:
                      f.features.split(",").filter(Boolean).length === FEATURE_CATALOG.length
                        ? ""
                        : FEATURE_CATALOG.map((x) => x.key).join(","),
                  }))
                }
              >
                {form.features.split(",").filter(Boolean).length === FEATURE_CATALOG.length
                  ? "Hapus semua"
                  : "Pilih semua"}
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-light)] p-2">
              {FEATURE_CATALOG.map((f) => {
                const selectedKeys = form.features
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const checked = selectedKeys.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? selectedKeys.filter((k) => k !== f.key)
                        : [...selectedKeys, f.key];
                      setForm({ ...form, features: next.join(",") });
                    }}
                    className={`flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs transition-colors ${
                      checked
                        ? "bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                        : "hover:bg-[var(--bg-tertiary)]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] ${
                        checked
                          ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{f.label}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">{f.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[var(--text-muted)] text-xs">
              {form.features.split(",").filter(Boolean).length}/{FEATURE_CATALOG.length} fitur
              dipilih — disimpan sebagai daftar fitur paket.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent-gold)]"
            />
            Aktif (tampil di halaman harga)
          </label>

          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan Paket
          </Button>
        </form>
      </div>
    </div>
  );
}
