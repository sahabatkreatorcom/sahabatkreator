// Automation Rules — kelola aturan auto-reply keyword (DM & komentar)
// Builder: pilih sumber → keyword trigger → pesan balasan dengan placeholder.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Plus, Settings2, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";

type AutomationRule = {
  id: string;
  name: string;
  description: string | null;
  source: "dm" | "comment";
  socialAccountId: string | null;
  triggers: string[];
  action: { type: "reply"; message: string };
  isActive: boolean;
  triggeredCount: number;
  deliveredCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Account = {
  id: string;
  platform: string;
  username: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  dm: "Pesan DM",
  comment: "Komentar",
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

/** Form builder rule (buat baru / edit existing) */
function RuleForm({
  accounts,
  initial,
  onDone,
}: {
  accounts: Account[];
  initial?: AutomationRule;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [source, setSource] = useState<"dm" | "comment">(initial?.source ?? "dm");
  const [socialAccountId, setSocialAccountId] = useState(initial?.socialAccountId ?? "");
  const [triggersText, setTriggersText] = useState((initial?.triggers ?? []).join(", "));
  const [message, setMessage] = useState(initial?.action.message ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const triggers = triggersText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (triggers.length === 0) throw new Error("Minimal 1 keyword trigger");
      const body = {
        name,
        source,
        socialAccountId: socialAccountId || null,
        triggers,
        action: { type: "reply" as const, message },
        isActive,
      };
      if (initial) {
        return api.patch(`/automation/${initial.id}`, body);
      }
      return api.post("/automation", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success(initial ? "Rule diperbarui" : "Rule dibuat");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Settings2 className="h-4 w-4" />
        {initial ? `Edit: ${initial.name}` : "Buat Rule Baru"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rule-name">Nama Rule</Label>
          <Input
            id="rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth: Balasan harga"
            required
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-source">Sumber Trigger</Label>
          <Select
            id="rule-source"
            value={source}
            onChange={(e) => setSource(e.target.value as "dm" | "comment")}
          >
            <option value="dm">Pesan DM masuk</option>
            <option value="comment">Komentar baru</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rule-account">Akun Sosial (opsional — kosongkan untuk semua akun)</Label>
        <Select
          id="rule-account"
          value={socialAccountId}
          onChange={(e) => setSocialAccountId(e.target.value)}
        >
          <option value="">Semua akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.platform} {a.username ? `@${a.username}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rule-triggers">Keyword Trigger (pisahkan dengan koma)</Label>
        <Input
          id="rule-triggers"
          value={triggersText}
          onChange={(e) => setTriggersText(e.target.value)}
          placeholder="harga, berapa, promo"
          required
        />
        <p className="text-[var(--text-muted)] text-xs">
          Rule aktif bila pesan/komentar mengandung salah satu keyword (tidak peka huruf
          besar/kecil).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rule-message">Pesan Balasan Otomatis</Label>
        <Textarea
          id="rule-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hai {{name}}! Terima kasih sudah bertanya. Untuk info harga lengkap, cek link di bio ya 😊"
          required
          maxLength={1000}
        />
        <p className="text-[var(--text-muted)] text-xs">
          Placeholder: <code>{"{{username}}"}</code> <code>{"{{name}}"}</code>{" "}
          <code>{"{{keyword}}"}</code> (keyword yang cocok).
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent-gold)]"
        />
        Rule aktif
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Simpan Perubahan" : "Buat Rule"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
      </div>
    </form>
  );
}

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => api.get<{ rules: AutomationRule[]; accounts: Account[] }>("/automation"),
  });

  const toggleActive = useMutation({
    mutationFn: (rule: AutomationRule) =>
      api.patch(`/automation/${rule.id}`, { isActive: !rule.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/automation/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Rule dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rules = data?.rules ?? [];
  const accounts = data?.accounts ?? [];
  const editing = rules.find((r) => r.id === editingId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Automation</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Auto-reply berbasis keyword untuk DM &amp; komentar masuk. Balasan terkirim otomatis
            saat pesan baru tersinkron.
          </p>
        </div>
        {!showForm && !editing && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Buat Rule
          </Button>
        )}
      </div>

      {showForm && !editing && <RuleForm accounts={accounts} onDone={() => setShowForm(false)} />}
      {editing && (
        <RuleForm accounts={accounts} initial={editing} onDone={() => setEditingId(null)} />
      )}

      {/* List rules */}
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : rules.length === 0 && !showForm ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
            <Zap className="h-6 w-6" />
          </div>
          <h2 className="font-semibold">Belum ada rule automation</h2>
          <p className="max-w-sm text-[var(--text-secondary)] text-sm">
            Buat rule pertama untuk membalas pertanyaan pelanggan secara otomatis — misal keyword
            &ldquo;harga&rdquo; dijawab dengan daftar harga.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Buat Rule Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{rule.name}</h2>
                    <Badge variant={rule.source === "dm" ? "secondary" : "outline"}>
                      {rule.source === "dm" ? (
                        <MessageCircle className="h-3 w-3" />
                      ) : (
                        <MessageCircle className="h-3 w-3" />
                      )}
                      {SOURCE_LABELS[rule.source]}
                    </Badge>
                    {rule.isActive ? (
                      <Badge variant="success">aktif</Badge>
                    ) : (
                      <Badge variant="secondary">nonaktif</Badge>
                    )}
                  </div>
                  {rule.description && (
                    <p className="mt-1 text-[var(--text-secondary)] text-sm">{rule.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.triggers.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 font-medium text-[var(--text-secondary)] text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(rule.id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive.mutate(rule)}
                    disabled={toggleActive.isPending}
                  >
                    {rule.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => {
                      if (confirm(`Hapus rule "${rule.name}"?`)) remove.mutate(rule.id);
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-secondary)] text-sm">
                &ldquo;{rule.action.message}&rdquo;
              </div>

              <div className="flex flex-wrap gap-4 text-[var(--text-muted)] text-xs">
                <span>
                  Terpicu:{" "}
                  <strong className="text-[var(--text-secondary)]">{rule.triggeredCount}x</strong>
                </span>
                <span>
                  Terkirim:{" "}
                  <strong className="text-[var(--text-secondary)]">{rule.deliveredCount}x</strong>
                </span>
                {rule.lastTriggeredAt && <span>Terakhir: {timeAgo(rule.lastTriggeredAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
