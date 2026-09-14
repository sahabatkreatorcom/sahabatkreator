// Admin: Pengaturan — registrasi, maintenance mode, support email, AI
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type Settings = {
  registrationEnabled: boolean | null;
  maintenanceMode: boolean | null;
  maintenanceMessage: string | null;
  supportEmail: string | null;
  aiModel: string | null;
  aiConfigured?: boolean | null;
};

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get<{ settings: Settings | null }>("/admin/settings"),
  });

  useEffect(() => {
    if (data?.settings) {
      setRegistrationEnabled(data.settings.registrationEnabled ?? true);
      setMaintenanceMode(data.settings.maintenanceMode ?? false);
      setMaintenanceMessage(data.settings.maintenanceMessage ?? "");
      setSupportEmail(data.settings.supportEmail ?? "");
      setAiModel(data.settings.aiModel ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch("/admin/settings", {
        registrationEnabled,
        maintenanceMode,
        maintenanceMessage: maintenanceMessage || null,
        supportEmail: supportEmail || null,
        aiModel: aiModel || null,
        // Key kosong = tidak diubah; hanya kirim jika user isi field
        ...(aiApiKey ? { aiApiKey } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setAiApiKey("");
      toast.success("Pengaturan tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const aiConfigured = data?.settings?.aiConfigured ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Pengaturan Platform</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Konfigurasi global Sahabat Kreator
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <SettingsIcon className="h-4 w-4" />
          Umum
        </h2>

        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Registrasi Terbuka</p>
            <p className="text-[var(--text-secondary)] text-xs">
              Izinkan pengguna baru mendaftar sendiri
            </p>
          </div>
          <input
            type="checkbox"
            checked={registrationEnabled}
            onChange={(e) => setRegistrationEnabled(e.target.checked)}
            className="mt-1 h-5 w-9 cursor-pointer appearance-none rounded-full bg-[var(--bg-tertiary)] transition-colors before:mt-0.5 before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--accent-gold)] checked:before:translate-x-[18px]"
          />
        </label>

        <hr className="border-[var(--border-light)]" />

        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Mode Maintenance</p>
            <p className="text-[var(--text-secondary)] text-xs">
              Nonaktifkan akses aplikasi sementara (admin tetap bisa masuk)
            </p>
          </div>
          <input
            type="checkbox"
            checked={maintenanceMode}
            onChange={(e) => setMaintenanceMode(e.target.checked)}
            className="mt-1 h-5 w-9 cursor-pointer appearance-none rounded-full bg-[var(--bg-tertiary)] transition-colors before:mt-0.5 before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-red-500 checked:before:translate-x-[18px]"
          />
        </label>

        {maintenanceMode && (
          <div className="space-y-2">
            <Label htmlFor="maintenance-msg">Pesan Maintenance</Label>
            <Input
              id="maintenance-msg"
              placeholder="Kami sedang melakukan pemeliharaan. Kembali sebentar lagi!"
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              maxLength={500}
            />
          </div>
        )}

        <hr className="border-[var(--border-light)]" />

        <div className="space-y-2">
          <Label htmlFor="support-email">Email Support</Label>
          <Input
            id="support-email"
            type="email"
            placeholder="support@sahabatkreator.com"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
          />
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Pengaturan
        </Button>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          AI (OpenRouter)
          {aiConfigured ? (
            <Badge variant="success">Terpasang</Badge>
          ) : (
            <Badge variant="outline">Belum dikonfigurasi</Badge>
          )}
        </h2>

        <div className="space-y-2">
          <Label htmlFor="ai-api-key">
            API Key OpenRouter {aiConfigured && "(sudah tersimpan — isi untuk ganti)"}
          </Label>
          <Input
            id="ai-api-key"
            type="password"
            placeholder="sk-or-v1-..."
            value={aiApiKey}
            onChange={(e) => setAiApiKey(e.target.value)}
            autoComplete="off"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Dienkripsi AES-256 sebelum disimpan. Dapatkan di openrouter.ai/keys.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">Model Default</Label>
          <Input
            id="ai-model"
            placeholder="openai/gpt-4o-mini"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Format vendor/model, mis. openai/gpt-4o-mini, anthropic/claude-3.5-haiku,
            google/gemini-flash-1.5.
          </p>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Konfigurasi AI
        </Button>
      </div>
    </div>
  );
}
