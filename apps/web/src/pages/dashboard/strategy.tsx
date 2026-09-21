// Halaman Strategi Konten — brand voice, pillars, template caption, koleksi hashtag
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Layers, Loader2, Mic, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type BrandVoice = {
  description: string | null;
  tones: string[];
  vocabulary: string[];
  avoid: string[];
  guidelines: string | null;
  samples: string[];
};

type Pillar = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
};

type Template = {
  id: string;
  name: string;
  content: string;
  hashtags: string[];
  category: string | null;
  usageCount: number;
};

type Collection = {
  id: string;
  name: string;
  hashtags: string[];
  usageCount: number;
};

const TABS = [
  { id: "voice", label: "Brand Voice", icon: Mic },
  { id: "pillars", label: "Content Pillars", icon: Layers },
  { id: "templates", label: "Template Caption", icon: Sparkles },
  { id: "hashtags", label: "Koleksi Hashtag", icon: Hash },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Input tag list — nilai disimpan sebagai array string, dipisah koma saat ketik */
function TagListInput({
  label,
  placeholder,
  values,
  onChange,
  max,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <Badge key={`${v}-${i}`} variant="secondary" className="gap-1">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-[var(--text-muted)] hover:text-red-500"
              aria-label={`Hapus ${v}`}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const v = e.currentTarget.value.trim();
            if (v && values.length < max && !values.includes(v)) {
              onChange([...values, v]);
              e.currentTarget.value = "";
            }
          }
        }}
      />
      <p className="text-[10px] text-[var(--text-muted)]">Tekan Enter untuk tambah (maks {max})</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Brand Voice
// ---------------------------------------------------------------------------

function BrandVoiceTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["brand-voice"],
    queryFn: () => api.get<{ brandVoice: BrandVoice | null }>("/strategy/brand-voice"),
  });
  const [draft, setDraft] = useState<BrandVoice | null>(null);
  // Sinkron draft saat data pertama kali termuat
  const loaded = useState(() => true)[0];
  void loaded;
  const voice = draft ??
    data?.brandVoice ?? {
      description: "",
      tones: [],
      vocabulary: [],
      avoid: [],
      guidelines: "",
      samples: [],
    };
  const set = (patch: Partial<BrandVoice>) => setDraft({ ...voice, ...patch });

  const save = useMutation({
    mutationFn: () =>
      api.put("/strategy/brand-voice", {
        description: voice.description || null,
        tones: voice.tones,
        vocabulary: voice.vocabulary,
        avoid: voice.avoid,
        guidelines: voice.guidelines || null,
        samples: voice.samples,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-voice"] });
      setDraft(null);
      toast.success("Brand voice tersimpan — AI caption akan memakai suara brand ini");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-[var(--text-secondary)] text-sm">
        Tentukan suara brand Anda — dipakai otomatis oleh AI saat generate caption & rewrite agar
        konsisten di semua platform.
      </p>
      <div className="space-y-2">
        <Label>Deskripsi Suara Brand</Label>
        <Textarea
          rows={2}
          placeholder="mis. Ramah dan memezet ala warung kopi, pakai Bahasa Indonesia santai"
          value={voice.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <TagListInput
        label="Tone (3–6 kata)"
        placeholder="mis. ramah — Enter untuk tambah"
        values={voice.tones}
        onChange={(tones) => set({ tones })}
        max={8}
      />
      <TagListInput
        label="Kata / Frasa Khas"
        placeholder="mis. Santuy, Gaskeun — Enter untuk tambah"
        values={voice.vocabulary}
        onChange={(vocabulary) => set({ vocabulary })}
        max={30}
      />
      <TagListInput
        label="Hindari"
        placeholder="mis. bahasa kasar, akronim asing — Enter untuk tambah"
        values={voice.avoid}
        onChange={(avoid) => set({ avoid })}
        max={20}
      />
      <div className="space-y-2">
        <Label>Pedoman Tambahan</Label>
        <Textarea
          rows={3}
          placeholder="mis. Selalu sapa pembaca dengan 'Kak', tutup dengan pertanyaan"
          value={voice.guidelines ?? ""}
          onChange={(e) => set({ guidelines: e.target.value })}
        />
      </div>
      <TagListInput
        label="Contoh Caption Brand (bahan tiruan gaya AI)"
        placeholder="Tempel contoh caption lalu Enter"
        values={voice.samples}
        onChange={(samples) => set({ samples })}
        max={10}
      />
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        Simpan Brand Voice
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Content Pillars
// ---------------------------------------------------------------------------

/** Palet warna pilar — dipakai sebagai identitas visual pilar di seluruh app.
 *  Sengaja preset (bukan color picker bebas) supaya selalu kontras & konsisten. */
const PILLAR_COLORS = [
  "#3b82f6", // biru
  "#8b5cf6", // ungu
  "#ec4899", // pink
  "#ef4444", // merah
  "#f59e0b", // amber
  "#10b981", // hijau
  "#14b8a6", // teal
  "#64748b", // abu
];

function PillarsTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PILLAR_COLORS[0]);
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["pillars"],
    queryFn: () => api.get<{ pillars: Pillar[] }>("/strategy/pillars"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/strategy/pillars", {
        name: name.trim(),
        description: description.trim() || null,
        color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pillars"] });
      setName("");
      setDescription("");
      setColor(PILLAR_COLORS[0]);
      setExpanded(false);
      toast.success("Pillar ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/strategy/pillars/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pillars"] });
      toast.success("Pillar dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pillars = data?.pillars ?? [];

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-[var(--text-secondary)] text-sm">
        Kategori strategi konten Anda — mis. Edukasi 40%, Promosi 30%, Hiburan 30%.
      </p>
      <form
        className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <div className="flex gap-2">
          <Input
            placeholder="Nama pillar, mis. Edukasi Produk"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        </div>

        {expanded && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Deskripsi <span className="text-[var(--text-muted)]">(opsional)</span>
              </Label>
              <Textarea
                placeholder="Topik & angle apa yang masuk pilar ini? Mis. tutorial produk, tips pemakaian, FAQ"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Warna pilar</Label>
              <div className="flex flex-wrap gap-2">
                {PILLAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Pilih warna ${c}`}
                    aria-pressed={color === c}
                    className={cn(
                      "h-7 w-7 rounded-full transition",
                      color === c
                        ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg-secondary)]"
                        : "opacity-60 hover:opacity-100",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[var(--text-muted)] text-xs hover:underline"
          >
            + Tambah deskripsi & warna
          </button>
        )}
      </form>
      {pillars.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">
          Belum ada pillar — mulai dengan 3–4 kategori konten utama Anda.
        </p>
      ) : (
        <ul className="space-y-2">
          {pillars.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                {p.color && (
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm">{p.name}</p>
                  {p.description && (
                    <p className="text-[var(--text-muted)] text-xs">{p.description}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                className="text-[var(--text-muted)] hover:text-red-500"
                aria-label={`Hapus pillar ${p.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Template Caption
// ---------------------------------------------------------------------------

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", content: "", hashtags: "" });

  const { data } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<{ templates: Template[] }>("/strategy/templates"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/strategy/templates", {
        name: form.name,
        content: form.content,
        hashtags: form.hashtags
          .split(/[,\s]+/)
          .map((t) => t.replace(/^#/, ""))
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setForm({ name: "", content: "", hashtags: "" });
      toast.success("Template tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/strategy/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = data?.templates ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim() && form.content.trim()) create.mutate();
        }}
      >
        <h3 className="font-semibold">Template Baru</h3>
        <Input
          placeholder="Nama template, mis. Promo Diskon"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Textarea
          rows={4}
          placeholder="Isi caption. Pakai placeholder {produk}, {diskon}, {topik} untuk diganti saat compose"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
        <Input
          placeholder="Hashtag (pisah koma)"
          value={form.hashtags}
          onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
        />
        <Button type="submit" disabled={create.isPending || !form.name || !form.content}>
          <Plus className="h-4 w-4" /> Simpan Template
        </Button>
      </form>

      {templates.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">
          Belum ada template — simpan caption yang sering dipakai agar tidak menulis ulang.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      dipakai {t.usageCount}×
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[var(--text-secondary)] text-sm">
                    {t.content}
                  </p>
                  {t.hashtags.length > 0 && (
                    <p className="mt-2 text-[var(--accent-gold)] text-xs">
                      {t.hashtags.map((h) => `#${h}`).join(" ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  className="text-[var(--text-muted)] hover:text-red-500"
                  aria-label={`Hapus template ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Koleksi Hashtag
// ---------------------------------------------------------------------------

function HashtagsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", hashtags: "" });

  const { data } = useQuery({
    queryKey: ["hashtag-collections"],
    queryFn: () => api.get<{ collections: Collection[] }>("/strategy/hashtag-collections"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/strategy/hashtag-collections", {
        name: form.name,
        hashtags: form.hashtags
          .split(/[,\s]+/)
          .map((t) => t.replace(/^#/, ""))
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hashtag-collections"] });
      setForm({ name: "", hashtags: "" });
      toast.success("Koleksi tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/strategy/hashtag-collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hashtag-collections"] });
      toast.success("Koleksi dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const collections = data?.collections ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim() && form.hashtags.trim()) create.mutate();
        }}
      >
        <h3 className="font-semibold">Koleksi Baru</h3>
        <Input
          placeholder="Nama koleksi, mis. UMKM Fashion"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          placeholder="Hashtag dipisah koma: umkm, fashionlokal, styleindonesia"
          value={form.hashtags}
          onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
        />
        <Button type="submit" disabled={create.isPending || !form.name || !form.hashtags}>
          <Plus className="h-4 w-4" /> Simpan Koleksi
        </Button>
      </form>

      {collections.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">
          Belum ada koleksi — kelompokkan hashtag per tema/kampanye untuk dipakai sekali klik saat
          compose.
        </p>
      ) : (
        <ul className="space-y-3">
          {collections.map((col) => (
            <li key={col.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{col.name}</p>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      dipakai {col.usageCount}×
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[var(--accent-gold)] text-sm">
                    {col.hashtags.map((h) => `#${h}`).join(" ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(col.id)}
                  className="text-[var(--text-muted)] hover:text-red-500"
                  aria-label={`Hapus koleksi ${col.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

export function StrategyPage() {
  const [tab, setTab] = useState<TabId>("voice");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Strategi Konten</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Suara brand, kategori konten, dan aset siap pakai untuk compose
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm",
              tab === t.id
                ? "bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "voice" && <BrandVoiceTab />}
      {tab === "pillars" && <PillarsTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "hashtags" && <HashtagsTab />}
    </div>
  );
}
