import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Daftar path bahasa Inggris yang sudah tersedia
const AVAILABLE_EN_PATHS = new Set([
  "/",                    // /en
  "/kebijakan-privasi",  // /en/kebijakan-privasi
  "/penghapusan-data",   // /en/penghapusan-data
  "/syarat-ketentuan",   // /en/syarat-ketentuan
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cek apakah ini route bahasa Inggris (/en/...)
  if (!pathname.startsWith("/en")) {
    return NextResponse.next();
  }

  // Ambil path setelah /en
  const enPath = pathname === "/en" ? "/" : pathname.slice(3); // remove "/en" prefix

  // Jika path tersedia, biarkan Next.js menanganinya
  if (AVAILABLE_EN_PATHS.has(enPath)) {
    return NextResponse.next();
  }

  // Jika belum tersedia, redirect ke versi Indonesia (301 = SEO friendly)
  const indonesianUrl = new URL(pathname.replace(/^\/en/, ""), request.url);
  indonesianUrl.pathname = indonesianUrl.pathname === "" ? "/" : indonesianUrl.pathname;

  return NextResponse.redirect(indonesianUrl.toString(), 301);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
