// SSRF guard — validasi URL eksternal sebelum fetch (endpoint /media/import).
// Mencegah request ke jaringan internal: private/loopback/link-local/unique-local,
// termasuk IPv4-mapped IPv6 (::ffff:a.b.c.d).
import dns from "node:dns/promises";

/** Error khusus URL tidak aman — pesan Bahasa Indonesia utk respons 400 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/**
 * Cek apakah IPv4 berada dalam rentang CIDR private/terlarang.
 * Perbandingan pakai operasi integer (32-bit) — tanpa library eksternal.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true; // format aneh → anggap tidak aman
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return true;
  }
  const [a, b] = [Number(parts[0]), Number(parts[1])];
  const first = (a << 24) | (b << 16); // 16 bit atas cukup utk semua rentang /8-/16

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (first >= ((172 << 24) | (16 << 16)) && first < ((172 << 24) | (32 << 16))) return true;
  // 192.168.0.0/16
  if (first === ((192 << 24) | (168 << 16))) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (first === ((169 << 24) | (254 << 16))) return true;
  // 0.0.0.0 (unspecified)
  if (a === 0) return true;
  return false;
}

/**
 * Cek apakah IPv6 berada dalam rentang terlarang:
 * ::1 (loopback), fc00::/7 (unique-local), fe80::/10 (link-local),
 * ::ffff:x.x.x.x (IPv4-mapped → parse embedded IPv4).
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  // IPv4-mapped: ::ffff:a.b.c.d → validasi IPv4 yang tertanam
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1] !== undefined) return isPrivateIPv4(mapped[1]);
  // fc00::/7 → prefix fc / fd ; fe80::/10 → prefix fe8/fe9/fea/feb
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true;
  }
  return false;
}

/** Cek satu alamat IP (v4/v6) apakah mengarah ke jaringan internal */
function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * Validasi URL eksternal:
 * a. Hanya skema http/https.
 * b. Resolve hostname via DNS (semua A/AAAA record) — tolak bila ada IP
 *    yang menuju jaringan internal (private/loopback/link-local/ULA).
 * Melempar UnsafeUrlError bila tidak aman (dipetakan 400 oleh route).
 */
export async function assertSafeExternalUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError("URL tidak valid");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("Hanya URL http/https yang didukung");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // hilangkan bracket IPv6
  // Hostname literal IP → cek langsung tanpa DNS
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError("URL mengarah ke alamat internal — tidak diizinkan");
    }
    return;
  }

  // Resolve semua record (all: true) — satu saja yang private → tolak
  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("Hostname tidak dapat diselesaikan (DNS)");
  }
  for (const { address } of records) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError("URL mengarah ke alamat internal — tidak diizinkan");
    }
  }
}
