// Helper parsing query param tanggal (YYYY-MM-DD) → Date.
// Dipakai route yang menerima filter rentang tanggal (?from=&to=).

/**
 * Parse query param tanggal (YYYY-MM-DD) → Date.
 * `endOfDay` menyetel jam 23:59:59.999 supaya rentang `to` inklusif
 * (query `>= from AND <= to` kalau tidak pakai ini akan melewatkan
 * baris yang dibuat di hari `to` setelah tengah malam).
 */
export function parseDateParam(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}
