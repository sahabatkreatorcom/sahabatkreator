// Admin: Kredensial Platform — per-platform OAuth card grid + bridge Repliz

import { env } from "@sahabatkreator/env/web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Save, ShieldCheck, Waypoints, Webhook } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { PLATFORMS, type Platform } from "@/lib/platforms";

type Credential = {
  id: string;
  platform: string;
  clientId: string;
  redirectUri: string | null;
  isActive: boolean;
  updatedAt: string;
  /** True bila webhook verify token tersimpan di DB (extraConfigEnc) */
  webhookVerifyTokenConfigured?: boolean;
};

type CredentialForm = {
  clientId: string;
  clientSecret: string;
  webhookVerifyToken: string;
};

/** Platform dengan webhook handshake Meta (hub.verify_token) — butuh verify token.
 *  TikTok diverifikasi via client secret, tanpa verify token. */
const VERIFY_TOKEN_PLATFORMS = ["instagram", "instagram_standalone", "facebook", "threads"];

/** Webhook info per platform — endpoint sesuai aplikasi, bukan per platform.
 *  Instagram (akun bisnis via FB Login) & Facebook: satu aplikasi Meta → /webhooks/meta.
 *  Instagram standalone (IG Login): aplikasi terpisah → /webhooks/instagram-standalone.
 *  Threads: aplikasi sendiri (developers.threads.net) → /webhooks/threads. */
function buildWebhookInfo(platform: Platform, serverOrigin: string) {
  if (platform === "instagram_standalone") {
    return {
      label: "Webhook URL",
      url: `${serverOrigin}/webhooks/instagram-standalone`,
      note: "Instagram Login — aplikasi terpisah. Verify token: form di bawah (fallback env INSTAGRAM_WEBHOOK_VERIFY_TOKEN).",
    };
  }
  if (platform === "instagram" || platform === "facebook") {
    return {
      label: "Webhook URL",
      url: `${serverOrigin}/webhooks/meta`,
      note: "Instagram & Facebook — satu aplikasi Meta. Verify token: form di bawah (fallback env META_WEBHOOK_VERIFY_TOKEN).",
    };
  }
  if (platform === "threads") {
    return {
      label: "Webhook URL",
      url: `${serverOrigin}/webhooks/threads`,
      note: "Threads — aplikasi terpisah (developers.threads.net). Verify token: form di bawah (fallback env THREADS_WEBHOOK_VERIFY_TOKEN).",
    };
  }
  if (platform === "tiktok") {
    return {
      label: "Webhook URL",
      url: `${serverOrigin}/webhooks/tiktok`,
      note: "TikTok Developer Console → Webhooks. Signature otomatis diverifikasi dari Client Secret.",
    };
  }
  return null;
}

/** Data deletion callback URL (syarat App Review) — hanya app keluarga Meta yang
 *  memakai protokol signed_request. Daftarkan di App Dashboard → Settings →
 *  Advanced → Data Deletion Request Callback URL. */
function buildDeletionInfo(platform: Platform, serverOrigin: string) {
  if (platform === "instagram_standalone") {
    return {
      url: `${serverOrigin}/webhooks/instagram-standalone/data-deletion`,
      note: "Daftarkan di developers.facebook.com (app Instagram Login) → Settings → Advanced.",
    };
  }
  if (platform === "instagram" || platform === "facebook") {
    return {
      url: `${serverOrigin}/webhooks/meta/data-deletion`,
      note: "Daftarkan di App Dashboard Meta → Settings → Advanced.",
    };
  }
  if (platform === "threads") {
    return {
      url: `${serverOrigin}/webhooks/threads/data-deletion`,
      note: "Daftarkan di developers.threads.net → Settings → Advanced.",
    };
  }
  return null;
}

function buildSubtitle(platform: Platform, hasCredential: boolean) {
  const status = hasCredential ? "Sudah dikonfigurasi" : "Belum dikonfigurasi";
  const withWebhook = ["instagram", "instagram_standalone", "facebook", "threads", "tiktok"];
  if (withWebhook.includes(platform)) return `OAuth connect + webhook · ${status}`;
  return `OAuth connect · ${status}`;
}

type BridgeData = {
  bridge: {
    provider: string;
    accessKey: string;
    isActive: boolean;
    routing: Record<string, "native" | "repliz">;
    updatedAt: string;
    secretConfigured: boolean;
  } | null;
  supportedPlatforms: string[];
};

/** Section bridge Repliz — kredensial global + routing OAuth per platform (native vs repliz) */
function ReplizBridgeSection({ serverOrigin }: { serverOrigin: string }) {
  const queryClient = useQueryClient();
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [routing, setRouting] = useState<Record<string, "native" | "repliz">>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-bridge-config"],
    queryFn: () => api.get<BridgeData>("/admin/bridge-config"),
  });

  // Prefill form saat data pertama kali dimuat
  const loadedRef = useRef(false);
  useEffect(() => {
    if (data && !loadedRef.current) {
      loadedRef.current = true;
      setAccessKey(data.bridge?.accessKey ?? "");
      setRouting(data.bridge?.routing ?? {});
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.post("/admin/bridge-config", {
        accessKey,
        ...(secretKey ? { secretKey } : {}), // kosong = pertahankan secret lama
        isActive: true,
        routing,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bridge-config"] });
      setSecretKey("");
      toast.success("Bridge Repliz tersimpan (secret terenkripsi)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const supported = data?.supportedPlatforms ?? [];
  const configured = Boolean(data?.bridge?.secretConfigured);

  return (
    <div className="card p-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-[var(--border-light)] border-b p-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
          <Waypoints className="h-4.5 w-4.5 text-[var(--accent-gold)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">Repliz Bridge</p>
            <Badge variant={configured ? "success" : "secondary"}>
              {configured ? "Terkonfigurasi" : "Belum dikonfigurasi"}
            </Badge>
          </div>
          <p className="mt-0.5 text-[var(--text-muted)] text-xs">
            Bridge sementara — OAuth connect &amp; publish via API Repliz selama akses API native
            belum disetujui platform
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* Kredensial */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="repliz-access-key" className="text-xs">
              Access Key
            </Label>
            <Input
              id="repliz-access-key"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Access Key (repliz.com/user/setting/api)"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repliz-secret-key" className="text-xs">
              Secret Key
            </Label>
            <Input
              id="repliz-secret-key"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={configured ? "•••••••• (sudah tersimpan)" : "Secret Key"}
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Routing per platform */}
        <div>
          <p className="mb-2 font-medium text-[var(--text-secondary)] text-xs">
            OAuth routing per platform — akun baru via Repliz atau aplikasi native
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {supported.map((platform) => {
              const mode = routing[platform] === "repliz" ? "repliz" : "native";
              const label = PLATFORMS[platform as Platform]?.label ?? platform;
              return (
                <div
                  key={platform}
                  className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                >
                  <span className="text-sm">{label}</span>
                  <div className="flex rounded-md border border-[var(--border-light)]">
                    {(["native", "repliz"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setRouting((r) => ({ ...r, [platform]: m }))}
                        className={`px-2.5 py-1 font-medium text-xs capitalize transition-colors ${
                          mode === m
                            ? m === "repliz"
                              ? "bg-[var(--accent-gold)] text-white"
                              : "bg-[var(--bg-quaternary)] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {m === "repliz" ? "Repliz" : "Native"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Routing hanya memengaruhi koneksi akun baru. Akun yang sudah terhubung tetap diarahkan
            sesuai metode koneksi awalnya.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-[var(--border-light)] border-t px-4 py-3">
        <p className="text-[11px] text-[var(--text-muted)]">
          Callback Repliz:{" "}
          <span className="font-mono">
            {serverOrigin}/api/oauth/{"{platform}"}/repliz-callback
          </span>
        </p>
        <Button
          size="sm"
          disabled={save.isPending || !accessKey || (!secretKey && !configured)}
          onClick={() => save.mutate()}
          className="bg-[var(--accent-gold)] text-white hover:bg-[var(--accent-gold)]/90"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Simpan Bridge
        </Button>
      </div>
    </div>
  );
}

function PlatformCard({
  platformKey,
  platformCfg,
  existing,
  serverOrigin,
  onSave,
  saving,
}: {
  platformKey: Platform;
  platformCfg: (typeof PLATFORMS)[Platform];
  existing?: Credential;
  serverOrigin: string;
  onSave: (platform: Platform, data: CredentialForm & { deleteVerifyToken: boolean }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CredentialForm>({
    clientId: existing?.clientId ?? "",
    clientSecret: "",
    webhookVerifyToken: "",
  });
  const [deleteToken, setDeleteToken] = useState(false);

  const Icon = platformCfg.icon;
  const callbackUrl = `${serverOrigin}/api/oauth/${platformKey}/callback`;
  const webhookInfo = buildWebhookInfo(platformKey, serverOrigin);
  const deletionInfo = buildDeletionInfo(platformKey, serverOrigin);

  const handleSave = () => {
    onSave(platformKey, { ...form, deleteVerifyToken: deleteToken });
  };

  return (
    <div className="card flex flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-[var(--border-light)] border-b p-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
          <Icon className="h-4.5 w-4.5" style={{ color: platformCfg.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{platformCfg.label}</p>
            <Badge variant={existing?.isActive ? "success" : "secondary"}>
              {existing?.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </div>
          <p className="mt-0.5 text-[var(--text-muted)] text-xs">
            {buildSubtitle(platformKey, !!existing)}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Callback URL */}
        <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
            <Link2 className="h-3.5 w-3.5" />
            Callback URL (OAuth redirect)
          </div>
          <p className="mt-1 break-all font-mono text-[var(--text-primary)] text-xs">
            {callbackUrl}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Sama untuk semua platform — daftarkan persis seperti tertulis di konsol pengembang.
          </p>
        </div>

        {/* Webhook URL */}
        {webhookInfo && (
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
            <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
              <Webhook className="h-3.5 w-3.5" />
              {webhookInfo.label}
            </div>
            <p className="mt-1 break-all font-mono text-[var(--text-primary)] text-xs">
              {webhookInfo.url}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{webhookInfo.note}</p>
          </div>
        )}

        {/* Data Deletion Callback URL (syarat App Review) */}
        {deletionInfo && (
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
            <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Data Deletion Callback URL
            </div>
            <p className="mt-1 break-all font-mono text-[var(--text-primary)] text-xs">
              {deletionInfo.url}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{deletionInfo.note}</p>
          </div>
        )}

        {/* Client ID */}
        <div className="space-y-1.5">
          <Label htmlFor={`client-id-${platformKey}`} className="text-xs">
            Client ID
          </Label>
          <Input
            id={`client-id-${platformKey}`}
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            placeholder="App ID / Client ID"
            className="h-9 text-sm"
          />
        </div>

        {/* Client Secret */}
        <div className="space-y-1.5">
          <Label htmlFor={`client-secret-${platformKey}`} className="text-xs">
            Client Secret
          </Label>
          <Input
            id={`client-secret-${platformKey}`}
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
            placeholder={existing ? "•••••••• (sudah tersimpan)" : "App Secret"}
            className="h-9 text-sm"
          />
        </div>

        {/* Webhook Verify Token — hanya platform dengan handshake Meta */}
        {VERIFY_TOKEN_PLATFORMS.includes(platformKey) && (
          <div className="space-y-1.5">
            <Label htmlFor={`verify-token-${platformKey}`} className="text-xs">
              Webhook Verify Token
            </Label>
            <Input
              id={`verify-token-${platformKey}`}
              type="password"
              value={form.webhookVerifyToken}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({ ...f, webhookVerifyToken: value }));
                if (value) setDeleteToken(false);
              }}
              placeholder={
                deleteToken
                  ? "Token akan dihapus saat disimpan (kembali ke env)"
                  : existing?.webhookVerifyTokenConfigured
                    ? "•••••••• (sudah tersimpan)"
                    : "Verify token (sama dengan yang di App Dashboard → Webhooks)"
              }
              className="h-9 text-sm"
              disabled={deleteToken}
            />
            {existing?.webhookVerifyTokenConfigured && (
              <button
                type="button"
                onClick={() => setDeleteToken((d) => !d)}
                className="text-[11px] text-red-500 hover:underline"
              >
                {deleteToken
                  ? "Batal hapus — pertahankan token tersimpan"
                  : "Hapus token tersimpan (kembali ke env)"}
              </button>
            )}
            <p className="text-[11px] text-[var(--text-muted)]">
              Dipakai saat handshake webhook (hub.verify_token) — harus sama dengan yang diisi di
              App Dashboard. Kosong &amp; belum tersimpan = pakai env.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-[var(--border-light)] border-t px-4 py-3">
        <Button
          size="sm"
          disabled={saving || !form.clientId}
          onClick={handleSave}
          className="bg-[var(--accent-gold)] text-white hover:bg-[var(--accent-gold)]/90"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Simpan
        </Button>
      </div>
    </div>
  );
}

export function AdminCredentialsPage() {
  const queryClient = useQueryClient();
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-credentials"],
    queryFn: () => api.get<{ credentials: Credential[] }>("/admin/platform-credentials"),
  });

  // Hooks harus dipanggil sebelum early return — map kredensial per platform
  const credentials = data?.credentials ?? [];
  const credentialMap = useMemo(() => {
    const map: Record<string, Credential> = {};
    for (const cred of credentials) {
      map[cred.platform] = cred;
    }
    return map;
  }, [credentials]);

  const save = useMutation({
    mutationFn: (input: {
      platform: string;
      clientId: string;
      clientSecret: string;
      webhookVerifyToken?: string;
      deleteWebhookVerifyToken?: boolean;
    }) => api.post("/admin/platform-credentials", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-credentials"] });
      toast.success("Kredensial tersimpan (secret terenkripsi)");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setSavingPlatform(null),
  });

  if (isLoading) return <PageLoader />;

  const serverOrigin = env.VITE_SERVER_URL || window.location.origin;

  const platformEntries = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

  const handleSave = (
    platform: Platform,
    formData: CredentialForm & { deleteVerifyToken: boolean },
  ) => {
    if (!formData.clientId) {
      toast.error("Client ID wajib diisi");
      return;
    }
    if (!formData.clientSecret && !credentialMap[platform]) {
      toast.error("Client Secret wajib diisi untuk kredensial baru");
      return;
    }
    setSavingPlatform(platform);
    save.mutate({
      platform,
      clientId: formData.clientId,
      clientSecret: formData.clientSecret,
      // Token baru bila diisi; flag hapus bila diminta; selain itu tidak dikirim
      ...(formData.webhookVerifyToken ? { webhookVerifyToken: formData.webhookVerifyToken } : {}),
      ...(formData.deleteVerifyToken ? { deleteWebhookVerifyToken: true } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Kredensial Platform</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Konfigurasi OAuth App ID, Secret, dan Webhook per platform sosial
        </p>
      </div>

      {/* Bridge Repliz — di atas platform cards */}
      <ReplizBridgeSection serverOrigin={serverOrigin} />

      {/* Platform cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {platformEntries.map(([key, cfg]) => (
          <PlatformCard
            key={key}
            platformKey={key as Platform}
            platformCfg={cfg}
            existing={credentialMap[key]}
            serverOrigin={serverOrigin}
            onSave={handleSave}
            saving={savingPlatform === key && save.isPending}
          />
        ))}
      </div>
    </div>
  );
}
