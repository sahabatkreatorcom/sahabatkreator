// Hook PWA install — tangkap beforeinstallprompt, deteksi mode standalone
import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "sk-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari tidak support display-mode query
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePwaInstall() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault(); // cegel prompt default browser
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(mq.matches);
    mq.addEventListener("change", onMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mq.removeEventListener("change", onMode);
    };
  }, []);

  /** Banner hanya muncul bila: bisa diinstall, belum standalone, belum didismiss dalam 7 hari */
  const canShowBanner = useCallback(() => {
    if (!installEvent || standalone) return false;
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_COOLDOWN_MS) return false;
    return true;
  }, [installEvent, standalone]);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!installEvent) return "unavailable";
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null); // prompt hanya bisa sekali per event
    return outcome;
  }, [installEvent]);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setInstallEvent(null);
  }, []);

  return {
    canInstall: Boolean(installEvent),
    standalone,
    canShowBanner,
    promptInstall,
    dismissBanner,
  };
}
