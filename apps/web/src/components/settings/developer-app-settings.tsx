// Panel developer app — pemilik allowlist redirect untuk connect akun lewat API
// (docs/rfc-oauth-connect.md fase 4).
//
// MENGAPA dipisah dari daftar API key: app dan key punya siklus hidup berbeda.
// App memegang KEBIJAKAN (redirect URI mana yang boleh menerima `code`), key
// adalah KREDENSIAL yang memakainya. Menonaktifkan app langsung memblokir
// `GET /v1/accounts/:platform/authorize` untuk semua key yang menempel, tanpa
// mencabut key-nya — jadi key yang dipakai untuk hal lain tetap hidup.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "../../lib/query-keys";

type DeveloperAppRow = {
  id: string;
  name: string;
  allowedRedirectUris: string[];
  isActive: boolean;
  createdAt: string;
  keyCount: number;
};

/** Satu URI per baris → array. Baris kosong dibuang supaya paste tidak bikin error. */
function parseUris(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toText(uris: string[]): string {
  return uris.join("\n");
}

export function DeveloperAppSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [urisText, setUrisText] = useState("");
  // App yang sedang diedit URI-nya (null = tidak ada editor terbuka)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [blocked, setBlocked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.developerApps,
    queryFn: () => api.get<{ apps: DeveloperAppRow[] }>("/developer-apps"),
  });
  const apps = data?.apps ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.developerApps });
    // Jumlah key per app berubah saat key dibuat/dicabut — segarkan juga.
    queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
  };

  const handleError = (e: Error) => {
    if (e instanceof ApiError && e.status === 402) setBlocked(true);
    toast.error(e.message);
  };

  const createApp = useMutation({
    mutationFn: () =>
      api.post<{ app: DeveloperAppRow }>("/developer-apps", {
        name: name.trim(),
        allowedRedirectUris: parseUris(urisText),
      }),
    onSuccess: () => {
      toast.success("Developer app dibuat");
      setShowForm(false);
      setName("");
      setUrisText("");
      setBlocked(false);
      invalidate();
    },
    onError: handleError,
  });

  const updateApp = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      api.patch<{ app: DeveloperAppRow }>(`/developer-apps/${vars.id}`, vars.body),
    onSuccess: () => {
      toast.success("Developer app diperbarui");
      setEditingId(null);
      invalidate();
    },
    onError: handleError,
  });

  const deactivateApp = useMutation({
    mutationFn: (id: string) => api.delete(`/developer-apps/${id}`),
    onSuccess: () => {
      toast.success("Developer app dinonaktifkan");
      invalidate();
    },
    onError: handleError,
  });

  const formValid = name.trim().length > 0 && parseUris(urisText).length > 0;

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <AppWindow className="h-4 w-4" />
            Developer Apps
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Aplikasi milik Anda yang boleh menghubungkan akun sosmed lewat Public API. Setiap app
            memegang daftar redirect URI yang diizinkan menerima <code>code</code> OAuth.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          Buat app
        </Button>
      </div>

      {blocked && (
        <p className="rounded-[var(--radius-md)] bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950/50 dark:text-amber-300">
          Public API tidak termasuk paket Anda saat ini. Upgrade paket untuk membuat developer app.
        </p>
      )}

      {showForm && (
        <form
          className="space-y-4 border-[var(--border-light)] border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (formValid) createApp.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="devapp-name">Nama app</Label>
            <Input
              id="devapp-name"
              placeholder="mis. Dashboard Klien X"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devapp-uris">Redirect URI (satu per baris)</Label>
            <textarea
              id="devapp-uris"
              rows={3}
              placeholder={"https://dashboard.klien.com/oauth/callback"}
              value={urisText}
              onChange={(e) => setUrisText(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-3 font-mono text-xs"
            />
            <p className="text-[var(--text-muted)] text-xs">
              Wajib <code>https</code> (<code>http</code> hanya untuk localhost). Pencocokan{" "}
              <strong>persis</strong> — tanpa wildcard, tanpa prefix. Jangan sertakan fragment (
              <code>#</code>) karena akan menelan <code>code</code> yang kami tambahkan.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!formValid || createApp.isPending}>
              {createApp.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Buat app
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-[var(--text-secondary)] text-sm">Memuat…</p>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<AppWindow className="h-6 w-6" />}
          title="Belum ada developer app"
          description="Buat app untuk mulai menghubungkan akun sosmed lewat Public API."
        />
      ) : (
        <ul className="divide-y divide-[var(--border-light)]">
          {apps.map((app) => (
            <li key={app.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{app.name}</span>
                <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs">
                  {app.id}
                </code>
                {app.isActive ? (
                  <Badge variant="success">Aktif</Badge>
                ) : (
                  <Badge variant="destructive">Nonaktif</Badge>
                )}
                <span className="text-[var(--text-muted)] text-xs">
                  {app.keyCount} key menempel
                </span>
              </div>

              {editingId === app.id ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-3 font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={updateApp.isPending || parseUris(editText).length === 0}
                      onClick={() =>
                        updateApp.mutate({
                          id: app.id,
                          body: { allowedRedirectUris: parseUris(editText) },
                        })
                      }
                    >
                      Simpan URI
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {app.allowedRedirectUris.map((uri) => (
                    <li key={uri} className="font-mono text-[var(--text-muted)] text-xs">
                      {uri}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(app.id);
                    setEditText(toText(app.allowedRedirectUris));
                  }}
                >
                  Ubah URI
                </Button>
                {app.isActive ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deactivateApp.isPending}
                    onClick={() => {
                      // Nonaktifkan ≠ cabut key: key-nya tetap hidup untuk scope
                      // lain, hanya endpoint connect yang langsung 403.
                      const extra =
                        app.keyCount > 0
                          ? ` ${app.keyCount} key yang menempel akan berhenti bisa memakai endpoint connect (key-nya TIDAK dicabut).`
                          : "";
                      if (confirm(`Nonaktifkan app "${app.name}"?${extra}`)) {
                        deactivateApp.mutate(app.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Nonaktifkan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={updateApp.isPending}
                    onClick={() => updateApp.mutate({ id: app.id, body: { isActive: true } })}
                  >
                    <Power className="h-4 w-4" />
                    Aktifkan
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
