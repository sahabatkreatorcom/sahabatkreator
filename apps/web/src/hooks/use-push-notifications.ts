// Hook web push notification — subscribe/unsubscribe + status VAPID
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type PushStatus = {
  isSupported: boolean;
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  isConfigured: boolean;
};

/** Konversi VAPID public key base64url → Uint8Array untuk applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const queryClient = useQueryClient();

  const isSupported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const { data: vapidData } = useQuery({
    queryKey: ["push-vapid"],
    queryFn: () => api.get<{ publicKey: string | null; isConfigured: boolean }>("/push/vapid"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupported,
  });

  const { data: subData } = useQuery({
    queryKey: ["push-subscriptions"],
    queryFn: () => api.get<{ isSubscribed: boolean }>("/push/subscriptions"),
    staleTime: 60 * 1000,
    enabled: isSupported,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["push-subscriptions"] });
  };

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!isSupported) throw new Error("Browser tidak mendukung notifikasi push");
      const publicKey = vapidData?.publicKey;
      if (!publicKey) {
        throw new Error("Notifikasi belum dikonfigurasi admin (VAPID key belum digenerate)");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Izin notifikasi ditolak");
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      await api.post("/push/subscribe", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
    },
    onSuccess: () => {
      invalidate();
    },
  });

  const unsubscribe = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // DELETE dengan body (endpoint) — api.delete tidak support body
        await fetch(`${import.meta.env.VITE_SERVER_URL}/api/push/subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          credentials: "include",
        });
        await subscription.unsubscribe();
      }
    },
    onSuccess: () => {
      invalidate();
    },
  });

  // Deteksi desync: server bilang tidak subscribed tapi browser masih pegang subscription
  // (misal setelah admin rotate VAPID keys) → bersihkan subscription browser
  if (isSupported && subData?.isSubscribed === false && vapidData?.isConfigured === true) {
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => sub?.unsubscribe())
      .catch(() => undefined);
  }

  return {
    isSupported,
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    isConfigured: vapidData?.isConfigured ?? false,
    isSubscribed: subData?.isSubscribed ?? false,
    subscribe,
    unsubscribe,
  };
}
