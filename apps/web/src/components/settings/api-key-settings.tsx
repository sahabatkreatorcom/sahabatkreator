// Panel API key — daftar/buat/cabut/rotate token Public API (/v1).
//
// Token plaintext HANYA tampil di panel reveal (sekali), tidak pernah lagi
// setelah panel ditutup — server pun hanya menyimpan SHA-256-nya.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "../../lib/query-keys";

type ApiKeyRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

type CreatedKey = { key: ApiKeyRow; plaintext: string; notice: string };

/** Opsi scope dikelompokkan per domain — label manusia, bukan key teknis. */
const SCOPE_OPTIONS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: "Konten",
    items: [
      { key: "posts:read", label: "Lihat konten" },
      { key: "posts:write", label: "Buat & jadwalkan konten" },
    ],
  },
  {
    group: "Akun & Analitik",
    items: [
      { key: "accounts:read", label: "Daftar akun sosmed" },
      { key: "analytics:read", label: "Analitik performa" },
      { key: "reports:read", label: "Ringkasan laporan" },
    ],
  },
  {
    group: "Media & Render",
    items: [
      { key: "media:read", label: "Lihat media" },
      { key: "media:write", label: "Import media" },
      { key: "renders:read", label: "Status job render" },
      { key: "renders:write", label: "Buat carousel / video" },
    ],
  },
  {
    group: "AI & Automation",
    items: [
      { key: "ai:read", label: "Sisa kredit AI" },
      { key: "ai:write", label: "Generate caption & hashtag" },
      { key: "automation:read", label: "Lihat automation" },
      { key: "automation:write", label: "Kelola automation" },
    ],
  },
  {
    group: "Webhook",
    items: [
      { key: "webhooks:read", label: "Audit pengiriman webhook" },
      { key: "webhooks:write", label: "Konfigurasi webhook" },
    ],
  },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ApiKeySettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  // 402 = plan tidak punya fitur api_access (free) — tampilkan upsell, bukan error mentah
  const [blocked, setBlocked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: () => api.get<{ keys: ApiKeyRow[] }>("/api-keys"),
  });
  const keys = data?.keys ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });

  const handleError = (e: Error) => {
    if (e instanceof ApiError && e.status === 402) setBlocked(true);
    toast.error(e.message);
  };

  const createKey = useMutation({
    mutationFn: () =>
      api.post<CreatedKey>("/api-keys", {
        name: name.trim(),
        scopes,
        ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
      }),
    onSuccess: (res) => {
      setCreated(res);
      setCopied(false);
      setShowForm(false);
      setName("");
      setScopes([]);
      setExpiresInDays("");
      setBlocked(false);
      invalidate();
    },
    onError: handleError,
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      toast.success("API key dicabut");
      invalidate();
    },
    onError: handleError,
  });

  const rotateKey = useMutation({
    mutationFn: (id: string) => api.post<CreatedKey>(`/api-keys/${id}/rotate`),
    onSuccess: (res) => {
      setCreated(res);
      setCopied(false);
      invalidate();
    },
    onError: handleError,
  });

  const toggleScope = (key: string) =>
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const copyToken = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin — salin manual dari kolom");
    }
  };

  const formValid = name.trim().length > 0 && scopes.length > 0;

  return (
    <div className="space-y-4">
      {/* Panel reveal token — satu-satunya tempat plaintext tampil */}
      {created && (
        <div className="card space-y-3 border border-[var(--accent-gold)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 font-semibold text-[var(--accent-gold)]">
                <KeyRound className="h-4 w-4" />
                Simpan token ini sekarang
              </h2>
              <p className="text-[var(--text-secondary)] text-sm">{created.notice}</p>
            </div>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 font-mono text-xs">
              {created.plaintext}
            </code>
            <Button variant="outline" size="sm" onClick={copyToken}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Tersalin" : "Salin"}
            </Button>
          </div>
        </div>
      )}

      {/* Daftar key */}
      <div className="card space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" />
              Public API Keys
            </h2>
            <p className="mt-1 text-[var(--text-secondary)] text-sm">
              Token untuk memanggil Public API (/v1) dari aplikasi eksternal, Zapier, atau MCP.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            disabled={blocked}
          >
            <Plus className="h-4 w-4" />
            Buat key
          </Button>
        </div>

        {blocked && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950/50 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Public API tidak termasuk paket Anda saat ini. Upgrade paket untuk membuat token.
            </span>
          </div>
        )}

        {/* Form buat key */}
        {showForm && (
          <form
            className="space-y-4 border-[var(--border-light)] border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (formValid) createKey.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apikey-name">Nama key</Label>
                <Input
                  id="apikey-name"
                  placeholder="mis. Zapier, Dashboard Klien X"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apikey-expiry">Kedaluwarsa (hari, opsional)</Label>
                <Input
                  id="apikey-expiry"
                  type="number"
                  min={1}
                  max={3650}
                  placeholder="Kosong = tidak pernah kedaluwarsa"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Scope akses</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                {SCOPE_OPTIONS.map((group) => (
                  <div key={group.group} className="space-y-2">
                    <p className="font-medium text-[var(--text-muted)] text-xs uppercase">
                      {group.group}
                    </p>
                    {group.items.map((item) => (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={scopes.includes(item.key)}
                          onChange={() => toggleScope(item.key)}
                          className="h-4 w-4 accent-[var(--accent-gold)]"
                        />
                        <span>{item.label}</span>
                        <code className="text-[var(--text-muted)] text-xs">{item.key}</code>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[var(--text-muted)] text-xs">
                Pilih minimal satu scope. Scope menentukan endpoint mana yang bisa diakses key ini.
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!formValid || createKey.isPending}>
                {createKey.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Buat token
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Memuat…</p>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-6 w-6" />}
            title="Belum ada API key"
            description="Buat token untuk mulai memanggil Public API dari aplikasi eksternal."
          />
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {keys.map((k) => {
              const isRevoked = Boolean(k.revokedAt);
              const isExpired = Boolean(
                k.expiresAt && new Date(k.expiresAt).getTime() < Date.now(),
              );
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{k.name}</span>
                      <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs">
                        {k.tokenPrefix}…
                      </code>
                      {isRevoked ? (
                        <Badge variant="destructive">Dicabut</Badge>
                      ) : isExpired ? (
                        <Badge variant="warning">Kedaluwarsa</Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)] text-xs">
                      <span>Dibuat {formatDate(k.createdAt)}</span>
                      <span>•</span>
                      <span>Dipakai {formatDate(k.lastUsedAt)}</span>
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {!isRevoked && (
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rotateKey.mutate(k.id)}
                        disabled={rotateKey.isPending}
                        title="Ganti token (yang lama langsung mati)"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Rotate
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (
                            confirm(`Cabut key "${k.name}"? Tindakan ini tidak bisa dibatalkan.`)
                          ) {
                            revokeKey.mutate(k.id);
                          }
                        }}
                        disabled={revokeKey.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Cabut
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Contoh pemakaian */}
      <div className="card space-y-3 p-6">
        <h3 className="font-semibold text-sm">Contoh pemakaian</h3>
        <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-xs">
          {`curl -H "Authorization: Bearer sk_live_..." \\
  https://api.sahabatkreator.com/v1/ping`}
        </pre>
        <p className="text-[var(--text-muted)] text-xs">
          Ganti host dengan URL server yang kamu pakai. Endpoint tersedia di bawah /v1 — daftar
          lengkap ada di halaman /docs.
        </p>
      </div>
    </div>
  );
}
