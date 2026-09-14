// Admin: Konfigurasi Pembayaran (Sumopod Pay) — adaptasi stripe-config reference.
// Secret dienkripsi AES-256 di server; tidak pernah dikirim balik ke client.
// Field secret kosong = pertahankan nilai tersimpan.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Save, TestTube2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type PaymentConfig = {
  configured: boolean;
  source: "admin" | "env" | null;
  apiBaseUrl: string | null;
  apiKeyMasked: string | null;
  webhookTokenConfigured: boolean;
};

const SANDBOX_URL = "https://api-pay-sandbox.sumopod.com";

export function AdminPaymentConfigPage() {
  const queryClient = useQueryClient();
  const [apiBaseUrl, setApiBaseUrl] = useState(SANDBOX_URL);
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-config"],
    queryFn: () => api.get<PaymentConfig>("/admin/payment-config"),
  });

  useEffect(() => {
    if (data) {
      setApiBaseUrl(data.apiBaseUrl ?? SANDBOX_URL);
    }
  }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-payment-config"] });

  const save = useMutation({
    mutationFn: () =>
      api.patch("/admin/payment-config", {
        apiBaseUrl,
        // Secret kosong = tidak diubah; hanya kirim jika user isi field
        ...(apiKey ? { apiKey } : {}),
        ...(webhookToken ? { webhookToken } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setApiKey("");
      setWebhookToken("");
      toast.success("Konfigurasi pembayaran tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testConnection = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; message?: string; mode?: string }>("/admin/payment-config/test"),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Koneksi berhasil — mode ${result.mode}`);
      } else {
        toast.error(result.message ?? "Koneksi gagal");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeConfig = useMutation({
    mutationFn: () => api.delete("/admin/payment-config"),
    onSuccess: () => {
      invalidate();
      setApiKey("");
      setWebhookToken("");
      toast.success("Konfigurasi dihapus — kembali ke env");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const configured = data?.configured ?? false;
  const fromAdmin = data?.source === "admin";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Konfigurasi Pembayaran</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Kredensial Sumopod Pay — dipakai untuk checkout & webhook pembayaran
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4" />
            Status
          </h2>
          {configured ? (
            <Badge variant="success">Terpasang{fromAdmin ? " (panel admin)" : " (env)"}</Badge>
          ) : (
            <Badge variant="outline">Belum dikonfigurasi</Badge>
          )}
        </div>

        {configured && data?.apiKeyMasked && (
          <p className="text-[var(--text-secondary)] text-xs">
            API Key: <span className="font-mono">{data.apiKeyMasked}</span>
          </p>
        )}
        {configured && (
          <p className="text-[var(--text-secondary)] text-xs">
            Webhook token: {data?.webhookTokenConfigured ? "terpasang" : "belum diset"}
            {" — "}
            konfigurasi webhook URL di dashboard Sumopod (tab Settings)
          </p>
        )}
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="font-semibold">Kredensial API</h2>

        <div className="space-y-2">
          <Label htmlFor="api-base-url">API Base URL</Label>
          <Input
            id="api-base-url"
            placeholder={SANDBOX_URL}
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            className="font-mono"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Sandbox: {SANDBOX_URL} — produksi pakai URL dari dashboard Sumopod
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">
            API Key {configured && "(kosongkan untuk pertahankan yang tersimpan)"}
          </Label>
          <Input
            id="api-key"
            type="password"
            placeholder="X-Api-Key dari dashboard Sumopod"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            className="font-mono"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Dienkripsi AES-256 sebelum disimpan. Dikirim sebagai header X-Api-Key.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook-token">
            Webhook Token{" "}
            {configured && data?.webhookTokenConfigured && "(sudah tersimpan — isi untuk ganti)"}
          </Label>
          <Input
            id="webhook-token"
            type="password"
            placeholder="whtok_..."
            value={webhookToken}
            onChange={(e) => setWebhookToken(e.target.value)}
            autoComplete="off"
            className="font-mono"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Dipakai server memverifikasi header X-Webhook-Token dari webhook Sumopod.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan Konfigurasi
          </Button>
          <Button
            variant="outline"
            onClick={() => testConnection.mutate()}
            disabled={testConnection.isPending || !configured}
          >
            {testConnection.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube2 className="h-4 w-4" />
            )}
            Tes Koneksi
          </Button>
          {fromAdmin && (
            <Button
              variant="ghost"
              className="text-red-500"
              onClick={() => {
                if (
                  confirm(
                    "Hapus konfigurasi pembayaran? Billing kembali memakai env (atau nonaktif bila env kosong).",
                  )
                ) {
                  removeConfig.mutate();
                }
              }}
              disabled={removeConfig.isPending}
            >
              {removeConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Hapus Konfigurasi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
