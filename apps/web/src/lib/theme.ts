// Store tema dark/light (localStorage "sk-theme")
import { create } from "zustand";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "sk-theme";

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

type ThemeStore = {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  init: () => void;
};

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: "system",
  resolved: "light",
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme, resolved: resolveTheme(theme) });
  },
  toggle: () => {
    const current = get().resolved;
    get().setTheme(current === "dark" ? "light" : "dark");
  },
  init: () => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    applyTheme(stored);
    set({ theme: stored, resolved: resolveTheme(stored) });

    // Dengarkan perubahan preferensi sistem
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (get().theme === "system") {
        applyTheme("system");
        set({ resolved: resolveTheme("system") });
      }
    });
  },
}));
