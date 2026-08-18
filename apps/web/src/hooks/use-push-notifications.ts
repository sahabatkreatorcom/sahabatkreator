/**
 * Push Notifications Hook
 * Manages push notification subscription state and actions
 */

import { useState, useEffect, useCallback } from "react";

export interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission | "default";
  isSubscribed: boolean;
  isVapidConfigured: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UsePushNotificationsReturn extends PushNotificationState {
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTestNotification: (title?: string, body?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: "default",
    isSubscribed: false,
    isVapidConfigured: false,
    isLoading: true,
    error: null,
  });

  const checkSupport = useCallback(() => {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }, []);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const isSupported = checkSupport();
      const permission = isSupported ? Notification.permission : "default";

      const [vapidRes, subRes] = await Promise.all([
        fetch("/api/push/vapid"),
        fetch("/api/push"),
      ]);

      const [vapidData, subData] = await Promise.all([
        vapidRes.json(),
        subRes.json(),
      ]);

      const subscriptions = (subData.subscriptions ?? []) as Array<{
        id: string;
        userAgent: string | null;
        createdAt: string;
      }>;

      setState({
        isSupported,
        permission,
        isSubscribed: subscriptions.length > 0,
        isVapidConfigured: (vapidData as { configured?: boolean }).configured ?? false,
        isLoading: false,
        error: null,
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    }
  }, [checkSupport]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState((prev) => ({
        ...prev,
        error: "Browser tidak mendukung push notifications",
      }));
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState((prev) => ({
        ...prev,
        error: "Izin notifikasi ditolak",
      }));
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: null, // TODO: VAPID public key
      });

      const subscriptionData = await subscription.toJSON();
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys?.p256dh ?? "",
          auth: subscriptionData.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        }),
      });

      setState((prev) => ({ ...prev, isSubscribed: true, error: null }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Gagal subscribe",
      }));
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        // Delete from server
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        setState((prev) => ({ ...prev, isSubscribed: false }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Gagal unsubscribe",
      }));
    }
  }, []);

  const sendTestNotification = useCallback(
    async (title = "Test Notification", body = "Push notification berfungsi!") => {
      if (!state.isSubscribed) {
        setState((prev) => ({
          ...prev,
          error: "Anda belum subscribe push notification",
        }));
        return;
      }
      // Send via API (server will trigger notification)
      try {
        await fetch("/api/push/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
      } catch (e) {
        setState((prev) => ({
          ...prev,
          error: e instanceof Error ? e.message : "Gagal kirim test",
        }));
      }
    },
    [state.isSubscribed]
  );

  return {
    ...state,
    subscribe,
    unsubscribe,
    sendTestNotification,
    refresh,
  };
}
