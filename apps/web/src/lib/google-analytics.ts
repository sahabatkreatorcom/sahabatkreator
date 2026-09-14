declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function initializeGoogleAnalytics(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId);
}

export function trackGoogleAnalyticsEvent(
  eventName: string,
  parameters: Record<string, unknown> = {},
) {
  window.gtag?.("event", eventName, parameters);
}
