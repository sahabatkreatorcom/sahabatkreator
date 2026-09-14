// Admin: Kolaborasi — konfigurasi fitur Collab IG (adaptasi reference admin/collabs)
// Undangan collab bersifat ephemeral (real-time dari Graph API), jadi panel ini
// mengatur perilaku fitur: gate aktif/nonaktif, batas kolaborator, pesan undangan.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type CollabSettings = {
  collabEnabled: boolean | null;
  collabMaxCollaborators: number | null;
  collabAllowExternalCollaborators: boolean | null;
  collabAutoAcceptInvites: boolean | null;
  collabInviteMessage: string | null;
};

const DEFAULT_INVITE_MESSAGE =
  "Anda diundang berkolaborasi pada sebuah konten. Klik untuk menerima.";

/** Toggle switch CSS murni — konsisten dengan admin/settings */
function Toggle({
  checked,
  onChange,
  danger = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={`mt-1 h-5 w-9 cursor-pointer appearance-none rounded-full bg-[var(--bg-tertiary)] transition-colors before:mt-0.5 before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform ${
        danger ? "checked:bg-red-500" : "checked:bg-[var(--accent-gold)]"
      } checked:before:translate-x-[18px]`}
    />
  );
}

export function AdminCollabsPage() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [maxCollaborators, setMaxCollaborators] = useState(5);
  const [allowExternal, setAllowExternal] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get<{ settings: CollabSettings | null }>("/admin/settings"),
  });

  useEffect(() => {
    const s = data?.settings;
    if (s) {
      setEnabled(s.collabEnabled ?? true);
      setMaxCollaborators(s.collabMaxCollaborators ?? 5);
      setAllowExternal(s.collabAllowExternalCollaborators ?? false);
      setAutoAccept(s.collabAutoAcceptInvites ?? false);
      setInviteMessage(s.collabInviteMessage ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch("/admin/settings", {
        collabEnabled: enabled,
        collabMaxCollaborators: maxCollaborators,
        collabAllowExternalCollaborators: allowExternal,
        collabAutoAcceptInvites: autoAccept,
        collabInviteMessage: inviteMessage || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("Pengaturan kolaborasi tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Kolaborasi</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Konfigurasi fitur undangan kolaborasi Instagram (Collab IG)
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4" />
          Pengaturan Kolaborasi
        </h2>

        {/* biome-ignore lint/a11y/noLabelWithoutControl: label membungkus Toggle (input checkbox tersembunyi) */}
        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Aktifkan Kolaborasi</p>
            <p className="text-[var(--text-secondary)] text-xs">
              Matikan untuk menonaktifkan inbox undangan Collab IG di seluruh platform
            </p>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} danger={!enabled ? true : false} />
        </label>

        <hr className="border-[var(--border-light)]" />

        <div className="space-y-2">
          <Label htmlFor="max-collaborators">Maksimum Kolaborator per Konten</Label>
          <Input
            id="max-collaborators"
            type="number"
            min={1}
            max={20}
            value={maxCollaborators}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              setMaxCollaborators(Math.min(Math.max(Math.trunc(n), 1), 20));
            }}
            disabled={!enabled}
            className="w-24"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Rentang 1–20 kolaborator per konten
          </p>
        </div>

        <hr className="border-[var(--border-light)]" />

        {/* biome-ignore lint/a11y/noLabelWithoutControl: label membungkus Toggle (input checkbox tersembunyi) */}
        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Izinkan Kolaborator Eksternal</p>
            <p className="text-[var(--text-secondary)] text-xs">
              Kolaborator di luar organisasi bisa diundang ke konten
            </p>
          </div>
          <Toggle checked={allowExternal} onChange={setAllowExternal} />
        </label>

        <hr className="border-[var(--border-light)]" />

        {/* biome-ignore lint/a11y/noLabelWithoutControl: label membungkus Toggle (input checkbox tersembunyi) */}
        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Terima Undangan Otomatis</p>
            <p className="text-[var(--text-secondary)] text-xs">
              Undangan collab masuk diterima otomatis tanpa konfirmasi
            </p>
          </div>
          <Toggle checked={autoAccept} onChange={setAutoAccept} />
        </label>

        <hr className="border-[var(--border-light)]" />

        <div className="space-y-2">
          <Label htmlFor="invite-message">Pesan Undangan Default</Label>
          <textarea
            id="invite-message"
            placeholder={DEFAULT_INVITE_MESSAGE}
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
          />
          <p className="text-[var(--text-secondary)] text-xs">
            Maksimum 500 karakter — dipakai sebagai template pesan undangan
          </p>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Pengaturan Kolaborasi
        </Button>
      </div>
    </div>
  );
}
