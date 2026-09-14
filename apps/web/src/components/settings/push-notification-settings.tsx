// Panel notifikasi — status push, toggle enable/disable, preferensi kategori, test kirim
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { api } from "@/lib/api";

type NotifSettings = {
  postPublished: boolean;
  postFailed: boolean;
  newComment: boolean;
  newDm: boolean;
  newMention: boolean;
  newReview: boolean;
};

const CATEGORY_LABELS: Record<keyof NotifSettings, string> = {
  postPublished: "Konten berhasil dipublish",
  postFailed: "Konten gagal dipublish",
  newComment: "Komentar baru",
  newDm: "Pesan DM baru",
  newMention: "Mention baru",
  newReview: "Review baru",
};

export function PushNotificationSettings() {
  const queryClient = useQueryClient();
  const push = usePushNotifications();

  const { data } = useQuery({
    queryKey: ["push-settings"],
    queryFn: () => api.get<{ settings: NotifSettings; isConfigured: boolean }>("/push/settings"),
  });

  const updateSetting = useMutation({
    mutationFn: (patch: Partial<NotifSettings>) => api.patch("/push/settings", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["push-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testPush = useMutation({
    mutationFn: () => api.post<{ sent: number }>("/push/test"),
    onSuccess: () => toast.success("Notifikasi test terkirim — cek device kamu"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="h-4 w-4" />
            Notifikasi
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Terima update penting langsung di device kamu — publish selesai, DM baru, dan lainnya.
          </p>
        </div>
        {push.isSubscribed ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="secondary">Nonaktif</Badge>
        )}
      </div>

      {/* Status & toggle */}
      {!push.isSupported ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-secondary)] text-sm">
          Browser kamu tidak mendukung notifikasi push. Gunakan Chrome, Edge, Firefox, atau Safari
          versi terbaru.
        </p>
      ) : !push.isConfigured ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-secondary)] text-sm">
          Notifikasi belum dikonfigurasi oleh admin platform. Coba lagi nanti.
        </p>
      ) : push.permission === "denied" ? (
        <p className="rounded-[var(--radius-md)] bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950/50 dark:text-amber-300">
          Izin notifikasi diblokir browser. Buka pengaturan situs (ikon gembok di address bar) →
          izinkan Notifikasi, lalu refresh halaman.
        </p>
      ) : push.isSubscribed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => push.unsubscribe.mutate()}
            disabled={push.unsubscribe.isPending}
          >
            {push.unsubscribe.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            Nonaktifkan di device ini
          </Button>
          <Button variant="outline" onClick={() => testPush.mutate()} disabled={testPush.isPending}>
            {testPush.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Kirim tes notifikasi
          </Button>
        </div>
      ) : (
        <Button onClick={() => push.subscribe.mutate()} disabled={push.subscribe.isPending}>
          {push.subscribe.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          Aktifkan notifikasi di device ini
        </Button>
      )}

      {/* Preferensi kategori */}
      {push.isSubscribed && data?.settings && (
        <div className="space-y-2 border-[var(--border-light)] border-t pt-4">
          <p className="font-medium text-sm">Yang ingin kamu terima:</p>
          <div className="space-y-1">
            {(Object.keys(CATEGORY_LABELS) as Array<keyof NotifSettings>).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)]"
              >
                <span>{CATEGORY_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={data.settings[key]}
                  onChange={(e) => updateSetting.mutate({ [key]: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent-gold)]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
