// Hook riwayat generate AI (repurpose & carousel) — simpan ke localStorage.
// Hasil tersimpan per kategori, bisa di-restore tanpa habis credit lagi.
import { useCallback, useEffect, useState } from "react";

export type AiHistoryEntry = {
  id: string;
  type: "repurpose" | "carousel";
  label: string;
  content: string;
  metadata: Record<string, string>;
  createdAt: number;
};

const STORAGE_KEY = "sahabat-ai-history";
const MAX_ENTRIES = 20;

function loadHistory(): AiHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AiHistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: AiHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage penuh atau disabled — abaikan
  }
}

export function useAiHistory() {
  const [history, setHistory] = useState<AiHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const add = useCallback((entry: Omit<AiHistoryEntry, "id" | "createdAt">) => {
    const full: AiHistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    setHistory((prev) => {
      const next = [full, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(next);
      return next;
    });
    return full;
  }, []);

  const remove = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clear = useCallback((type?: "repurpose" | "carousel") => {
    setHistory((prev) => {
      const next = type ? prev.filter((e) => e.type !== type) : [];
      saveHistory(next);
      return next;
    });
  }, []);

  return { history, add, remove, clear };
}
