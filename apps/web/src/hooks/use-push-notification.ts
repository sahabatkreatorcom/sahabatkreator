/**
 * Hook untuk mengelola VAPID Push Notification subscription.
 *
 * Menggunakan Web Push API (PushManager) untuk:
 * - Meminta izin notifikasi browser
 * - Subscribe ke service worker dengan VAPID key
 * - Menyimpan subscription ke server via POST /api/push
 * - Menghapus subscription via DELETE /api/push
 */
import { useState, useCallback, useEffect } from "react";
import { env } from "@sahabat-kreator/env/web";

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface UsePushNotificationReturn {
  isSupported: boolean;
  isPermissionGranted: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotification(): UsePushNotificationReturn {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPermissionGranted, setIsPermissionGranted] = useState(false);

    const isSupported =
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        typeof PushManager.prototype?.subscribe === "function";

    // Cek permission saat init
    useEffect(() => {
        if ("Notification" in window) {
            const perm = Notification.permission;
            setIsPermissionGranted(perm === "granted");
        }
    }, []);

    const subscribe = useCallback(async () => {
        if (!isSupported) {
            setError("Browser tidak mendukung push notification.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Minta permission notifikasi
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setError("Izin notifikasi ditolak oleh pengguna.");
                setIsLoading(false);
                return;
            }
            setIsPermissionGranted(true);

            // 2. Dapatkan registration service worker
            const registration = await navigator.serviceWorker.ready;

            // 3. Subscribe dengan VAPID key dari env
            const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidPublicKey) {
                setError("VAPID key tidak dikonfigurasi di server. Hubungi admin.");
                setIsLoading(false);
                return;
            }

            // Convert base64 URL-safe key ke Uint8Array
            const urlBase64ToUint8Array = (base64: string): Uint8Array => {
                const base64Str = base64.replace(/_/g, "/").replace(/-/g, "+");
                const binaryStr = atob(base64Str);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                return bytes;
            };

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
            });

            // 4. Kirim subscription ke server
            const subscriptionData: PushSubscriptionData = {
                endpoint: subscription.endpoint,
                p256dh: subscription.getKey("p256dh")
                    ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!)))
                    : "",
                auth: subscription.getKey("auth")
                    ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!)))
                    : "",
            };

            const res = await fetch("/api/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...subscriptionData,
                    userAgent: navigator.userAgent,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? "Gagal menyimpan subscription.");
            }

            setError(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Gagal subscribe push notification.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    const unsubscribe = useCallback(async () => {
        if (!isSupported) return;

        setIsLoading(true);
        setError(null);

        try {
            // Dapatkan subscription saat ini dari browser
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                // Sudah tidak terdaftar
                setIsLoading(false);
                return;
            }

            // Unsubscribe dari service worker
            await subscription.unsubscribe();

            // Hapus dari database (perlu mengambil subscriptionId dari cache/localStorage)
            // Untuk saat ini, kita hanya unsubscribe dari browser
            // Subscription di server akan dihapus saat kirim notification gagal
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Gagal unsubscribe.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    return {
        isSupported,
        isPermissionGranted,
        isLoading,
        error,
        subscribe,
        unsubscribe,
    };
}
