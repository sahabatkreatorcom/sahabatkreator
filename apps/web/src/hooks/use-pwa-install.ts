/**
 * Hook to manage PWA install prompt
 * Captures the beforeinstallprompt event and provides install trigger
 */

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

interface UsePWAInstallReturn {
  isInstallAvailable: boolean;
  isInstalled: boolean;
  isDismissed: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismissInstall: () => void;
}

const DISMISS_STORAGE_KEY = "sahabat-kreator-pwa-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function checkIsInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneQuery = window.matchMedia("(display-mode: standalone)");
  if (standaloneQuery.matches) return true;
  if (
    "standalone" in window.navigator &&
    (window.navigator as unknown as { standalone: boolean }).standalone ===
      true
  )
    return true;
  return false;
}

function checkIsDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dismissed = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!dismissed) return false;
    const dismissedAt = parseInt(dismissed, 10);
    if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return true;
    localStorage.removeItem(DISMISS_STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled] = useState(checkIsInstalled);
  const [isDismissed, setIsDismissed] = useState(checkIsDismissed);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!prompt) return "unavailable";
    await prompt.prompt();
    const choiceResult = await prompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      setIsDismissed(false);
    }
    setPrompt(null);
    return choiceResult.outcome;
  }, [prompt]);

  const dismissInstall = useCallback(() => {
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    setIsDismissed(true);
    setPrompt(null);
  }, []);

  return {
    isInstallAvailable: !!prompt && !isDismissed,
    isInstalled,
    isDismissed,
    promptInstall,
    dismissInstall,
  };
}
