import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic color for an org/user avatar ring, from a string id. */
export function ringColorFor(seed: string) {
  const colors = ["#5457E5", "#17A34A", "#F5A524", "#E5484D", "#0EA5E9"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Format tanggal/waktu dalam timezone WIB (Asia/Jakarta). */
export function formatDateWIB(date: Date | string | number) {
  return new Date(date).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}