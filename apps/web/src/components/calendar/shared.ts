// Helper tanggal & tipe bersama untuk komponen kalender
export type CalendarPostGroup = {
  id: string;
  content: string;
  scheduledAt: string | null;
  /** Waktu pengingat push aktif (non-null = reminder menyala) — M18 */
  reminderAt: string | null;
  /** Post eksternal = dipublikasikan langsung di platform (bukan via SK) */
  isExternal?: boolean;
  posts: {
    id: string;
    platform: string;
    status: string;
    username: string | null;
    externalUrl?: string | null;
    externalThumbnailUrl?: string | null;
    mediaType?: string | null;
  }[];
};

export type CalendarNote = {
  id: string;
  date: string;
  title: string;
  content: string | null;
  color: string | null;
};

/** Pilihan warna catatan kalender */
export const NOTE_COLORS = [
  { value: "#ec4899", label: "Pink (ide)" },
  { value: "#f59e0b", label: "Amber (promo)" },
  { value: "#10b981", label: "Hijau (tips)" },
  { value: "#3b82f6", label: "Biru (kolaborasi)" },
  { value: "#8b5cf6", label: "Ungu (produk)" },
] as const;

export const DAYS_ID = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Senin sebagai awal minggu (0=Sen) */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** YYYY-MM-DD lokal (tanpa konversi UTC) */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Awal minggu (Senin) yang memuat d */
export function startOfWeek(d: Date): Date {
  const start = new Date(d);
  start.setDate(d.getDate() - mondayIndex(d));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Jam HH:mm lokal */
export function formatTimeId(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Group items by tanggal YYYY-MM-DD (dari scheduledAt post atau date note).
 * scheduledAt dari server = ISO UTC — konversi ke tanggal lokal browser dulu,
 * jangan slice mentah string UTC (post WIB pagi akan bergeser ke hari sebelumnya). */
export function groupByDate<T extends { scheduledAt?: string | null; date?: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const raw = item.scheduledAt ?? item.date;
    if (!raw) continue;
    // date note sudah YYYY-MM-DD (tanpa jam) — pakai apa adanya
    const key = item.scheduledAt ? toLocalISODate(new Date(raw)) : raw.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

/**
 * Tandai drag index kontigu hanya untuk post native.
 * Post eksternal dirender non-draggable (dragIndex null) — react-beautiful-dnd
 * mensyaratkan index Draggable dalam satu Droppable kontigu dari 0 tanpa lubang.
 */
export function withDragIndexes(
  groups: CalendarPostGroup[],
): { g: CalendarPostGroup; dragIndex: number | null }[] {
  let next = 0;
  return groups.map((g) => ({ g, dragIndex: g.isExternal ? null : next++ }));
}
