// Hook draft compose — autosave debounce ke localStorage per organisasi
// dan restore saat mount bila draft masih segar (<24 jam).
// Draft menyimpan seluruh state editor: caption, hashtag, media, jadwal,
// akun terpilih, variasi per platform, sound, produk, dan pengaturan platform.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SettingsState } from "@/components/compose/platform-settings-panel";

/** Umur maksimum draft sebelum dianggap basi */
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 jam
/** Delay autosave setelah perubahan terakhir */
const AUTOSAVE_DEBOUNCE_MS = 2000;

export type ComposeDraft = {
  content: string;
  hashtags: string;
  mediaIds: string[];
  scheduledAt: string | null;
  accountIds: string[];
  /** Variasi caption per akun — accountId → custom caption */
  variations: Record<string, string>;
  /** Variasi hashtag per akun — accountId → hashtag custom */
  hashtagVariations: Record<string, string>;
  /** Sound terpilih (id + metadata minimal untuk info UI) */
  soundTrack: { id: string; title?: string } | null;
  /** Produk yang di-tag (id) */
  productIds: string[];
  platformSettings: Record<string, SettingsState>;
  savedAt: number;
};

function draftKey(orgId: string): string {
  return `sk-compose-draft-${orgId}`;
}

/** Filter record agar hanya berisi string→string (defensif terhadap JSON rusak) */
function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Validasi bentuk draft yang dibaca dari localStorage (partial & defensif) */
function parseDraft(raw: string | null): ComposeDraft | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ComposeDraft>;
    if (typeof data.content !== "string" || typeof data.savedAt !== "number") {
      return null;
    }
    return {
      content: data.content,
      hashtags: typeof data.hashtags === "string" ? data.hashtags : "",
      mediaIds: Array.isArray(data.mediaIds)
        ? data.mediaIds.filter((id): id is string => typeof id === "string")
        : [],
      scheduledAt: typeof data.scheduledAt === "string" ? data.scheduledAt : null,
      accountIds: Array.isArray(data.accountIds)
        ? data.accountIds.filter((id): id is string => typeof id === "string")
        : [],
      variations: stringRecord(data.variations),
      hashtagVariations: stringRecord(data.hashtagVariations),
      soundTrack:
        data.soundTrack &&
        typeof data.soundTrack === "object" &&
        typeof data.soundTrack.id === "string"
          ? { id: data.soundTrack.id, title: data.soundTrack.title }
          : null,
      productIds: Array.isArray(data.productIds)
        ? data.productIds.filter((id): id is string => typeof id === "string")
        : [],
      platformSettings:
        data.platformSettings && typeof data.platformSettings === "object"
          ? (data.platformSettings as Record<string, SettingsState>)
          : {},
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}

export function useComposeDraft(
  orgId: string | null | undefined,
  draft: Omit<ComposeDraft, "savedAt">,
  options?: {
    /** Dipanggil saat user membuang draft yang dipulihkan (reset editor) */
    onDiscard?: () => void;
  },
) {
  /** Waktu (epoch ms) autosave terakhir — untuk indikator "Tersimpan HH:MM" */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** Draft yang dipulihkan saat mount (sekali), null bila tidak ada */
  const [restoredDraft, setRestoredDraft] = useState<ComposeDraft | null>(null);
  const restoredRef = useRef(false);
  const onDiscardRef = useRef(options?.onDiscard);
  onDiscardRef.current = options?.onDiscard;

  // Serialisasi draft sebagai dependency stabil (perbandingan nilai, bukan
  // identitas objek) — cegah loop autosave saat re-render tanpa perubahan.
  const draftJson = JSON.stringify(draft);
  const lastSavedJsonRef = useRef<string | null>(null);

  // Restore sekali saat orgId tersedia: bila draft ada & masih <24 jam,
  // tampilkan toast dengan action "Buang" untuk menghapusnya.
  useEffect(() => {
    if (!orgId || restoredRef.current) return;
    restoredRef.current = true;

    const stored = parseDraft(localStorage.getItem(draftKey(orgId)));
    if (!stored) return;

    const isFresh = Date.now() - stored.savedAt < DRAFT_MAX_AGE_MS;
    const isMeaningful = stored.content.trim() !== "" || stored.mediaIds.length > 0;
    if (!isFresh || !isMeaningful) {
      // Draft basi/kosong — langsung bersihkan
      localStorage.removeItem(draftKey(orgId));
      return;
    }

    setRestoredDraft(stored);
    setSavedAt(stored.savedAt);
    toast("Draft dipulihkan", {
      description: "Perubahan terakhir Anda dimuat kembali.",
      action: {
        label: "Buang",
        onClick: () => {
          localStorage.removeItem(draftKey(orgId));
          setRestoredDraft(null);
          setSavedAt(null);
          // Reset editor agar autosave tidak menulis ulang draft yang dibuang
          onDiscardRef.current?.();
        },
      },
    });
  }, [orgId]);

  // Autosave debounce 2 detik — hanya saat ada isi DAN berubah dari yang tersimpan
  useEffect(() => {
    if (!orgId) return;
    const parsed = JSON.parse(draftJson) as ComposeDraft;
    const hasContent = parsed.content.trim() !== "" || parsed.mediaIds.length > 0;
    if (!hasContent) return;
    // Skip bila nilainya sama dengan yang terakhir tersimpan (hindari tulis ulang)
    if (draftJson === lastSavedJsonRef.current) return;

    const timer = window.setTimeout(() => {
      const payload: ComposeDraft = { ...parsed, savedAt: Date.now() };
      try {
        localStorage.setItem(draftKey(orgId), JSON.stringify(payload));
        lastSavedJsonRef.current = draftJson;
        setSavedAt(payload.savedAt);
      } catch {
        // localStorage penuh / disabled — autosave gagal senyap
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [orgId, draftJson]);

  /** Simpan draft sekarang juga (tanpa menunggu debounce) — untuk Ctrl+S */
  const saveNow = useCallback(() => {
    if (!orgId) return null;
    const parsed = JSON.parse(draftJson) as ComposeDraft;
    const hasContent = parsed.content.trim() !== "" || parsed.mediaIds.length > 0;
    if (!hasContent) return null;
    const payload: ComposeDraft = { ...parsed, savedAt: Date.now() };
    try {
      localStorage.setItem(draftKey(orgId), JSON.stringify(payload));
      lastSavedJsonRef.current = draftJson;
      setSavedAt(payload.savedAt);
      return payload.savedAt;
    } catch {
      return null;
    }
  }, [orgId, draftJson]);

  /** Hapus draft (dipanggil setelah post sukses dibuat atau user membuang) */
  const clearDraft = useCallback(() => {
    if (!orgId) return;
    localStorage.removeItem(draftKey(orgId));
    lastSavedJsonRef.current = null;
    setSavedAt(null);
    setRestoredDraft(null);
  }, [orgId]);

  return { savedAt, restoredDraft, clearDraft, saveNow };
}
