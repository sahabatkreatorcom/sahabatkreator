// Guard dashboard — redirect ke login jika belum ada session
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { PageLoader } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "../lib/query-keys";

export type MeResponse = {
  authenticated: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    role: string;
    twoFactorEnabled: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    role: string;
  } | null;
  organizations: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    role: string;
  }[];
  limits: Record<string, number> | null;
  /** Effective permission user di org aktif (kode dari katalog custom role). */
  permissions: string[];
  /** Flag "Registrasi Terbuka" dari /admin/settings (untuk halaman register) */
  registrationEnabled: boolean;
};

/** Query key session/me — dipakai lintas komponen dashboard */
export const meQueryOptions = {
  queryKey: queryKeys.me,
  queryFn: () => api.get<MeResponse>("/me"),
  staleTime: 60 * 1000,
  // 401 tidak diulang — itu memang "belum login". Tapi 429/5xx hanya gangguan
  // sesaat, dan tanpa pengecualian ini satu respons 429 (global rate limit
  // /api/* = 100 request/menit per IP) langsung dibaca sebagai "belum login",
  // sehingga pengguna yang sesinya sehat terlempar ke /login — dan itu bisa
  // terjadi saat pengguna membuka beberapa tab sekaligus. Cukup tunggu sebentar
  // lalu coba lagi sebelum menyimpulkan apa pun.
  retry: (failureCount: number, error: unknown) => {
    if (failureCount >= 2) return false;
    const status = error instanceof ApiError ? error.status : 0;
    return status === 429 || status >= 500;
  },
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
} as const;

/**
 * Sinkronkan cache ["me"] dengan session server — WAJIB di-await sebelum
 * navigate setelah status auth berubah (login, verifikasi email, 2FA, logout).
 *
 * Kenapa: /me guest sekarang balas 200 (bukan 401) agar console browser
 * bersih. Akibatnya react-query menyimpan success-state "authenticated:false"
 * yang masih fresh (staleTime 60s) — RequireAuth membaca cache lama dan
 * menendang user balik ke /login sebelum refetch sempat jalan. Error-state
 * dulu otomatis dianggap stale; success-state tidak.
 *
 * invalidateQueries() menandai cache stale + memicu refetch aktif,
 * await memastikan data baru sudah masuk cache sebelum navigate.
 */
export function useSyncSession() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
  };
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { data, isLoading, isError } = useQuery(meQueryOptions);

  if (isLoading) return <PageLoader />;

  // 401 / error → belum login
  if (isError || !data?.authenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Session ada tapi email belum terverifikasi (mis. session lama / OAuth) →
  // arahkan ke halaman verifikasi agar user tidak bisa memakai dashboard.
  if (!data.user.emailVerified && location.pathname !== "/verify-email") {
    return <Navigate to="/verify-email" replace />;
  }

  // Belum punya org → arahkan ke wizard buat org
  if (data.organizations.length === 0 && location.pathname !== "/create-organization") {
    return <Navigate to="/create-organization" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/**
 * Effective permission user di org aktif (dari /me). Dipakai untuk
 * menyembunyikan menu/halaman yang tidak bisa diakses, mis. Billing untuk
 * anggota tanpa `billing.view`. Owner selalu punya semua.
 *
 * Sebelum data /me siap, `has()` mengembalikan true agar menu tidak
 * berkedip-kedip; server tetap penentu akhir (403).
 */
export function usePermissions(): {
  permissions: Set<string>;
  has: (code: string) => boolean;
} {
  const { data } = useQuery(meQueryOptions);
  const list = data?.permissions;
  const permissions = new Set(list ?? []);
  return { permissions, has: (code) => (list ? permissions.has(code) : true) };
}

/**
 * Guard kebalikan RequireAuth — halaman guest (login/register/forgot).
 * User yang masih terautentikasi diarahkan ke dashboard (atau ?redirect=).
 * Jangan dipakai di /verify-email & /two-factor — keduanya bagian dari
 * flow login (session parsial justru diharapkan ada di sana).
 */
export function RedirectIfAuthenticated({ children }: { children?: ReactNode }) {
  const [params] = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/dashboard";
  const { data, isLoading } = useQuery(meQueryOptions);

  // Cek session berjalan — jangan render form login saat masih loading,
  // kalau tidak user melihat kedipan form lalu tiba-tiba di-redirect
  if (isLoading) return <PageLoader />;

  if (data?.authenticated) return <Navigate to={redirectTo} replace />;

  // Dipakai sebagai pathless layout route di router — anak-anaknya dirender
  // via Outlet; children prop hanya untuk pemakaian langsung membungkus elemen.
  return <>{children ?? <Outlet />}</>;
}
