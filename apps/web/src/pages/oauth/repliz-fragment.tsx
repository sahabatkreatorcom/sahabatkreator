// Halaman perantara OAuth Repliz untuk flow "fragment" — FALLBACK.
//
// Docs Repliz (OAuth Flow Guide) menyebut Facebook bisa mengembalikan token di
// URL FRAGMENT: https://…/callback#access_token=…
// Fragment (bagian setelah "#") TIDAK PERNAH dikirim ke server HTTP manapun —
// hanya bisa dibaca di browser via window.location.hash.
//
// Dalam praktiknya Repliz mengembalikan ?code=… di QUERY STRING untuk semua
// platform (termasuk Facebook), sehingga callback server (GET
// /api/oauth/:platform/repliz-callback/:state) menangani semuanya langsung dan
// halaman ini tidak pernah dicapai. Route tetap dipasang sebagai jaring pengaman:
// bila suatu hari Repliz benar-benar memakai fragment, halaman ini membaca hash
// (atau query) di sisi client lalu men-POST token-nya ke endpoint callback server
// sebagai JSON body. Server memvalidasi state (sudah tersimpan saat /start) lalu
// melanjutkan flow exchange → connect → upsert akun, dan mengembalikan { redirect }.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { api } from "@/lib/api";

export function ReplizFragmentPage() {
  const { platform = "", state = "" } = useParams<{ platform: string; state: string }>();
  const [status, setStatus] = useState<"extracting" | "posting" | "error">("extracting");
  const [message, setMessage] = useState<string>("");
  // Guard: StrictMode double-invoke + StrictMode React 18 mount 2x bisa POST dobel.
  const postedRef = useRef(false);

  useEffect(() => {
    if (postedRef.current) return;
    postedRef.current = true;

    (async () => {
      try {
        // 1. Ekstrak kredensial OAuth dari URL.
        //    Docs Repliz menyebut Facebook mengembalikan token di FRAGMENT
        //    (#access_token=…), tapi pada praktiknya Repliz juga mengembalikan
        //    ?code=… di QUERY STRING (tergantung konfigurasi app). Karena halaman
        //    ini adalah frontend page, kedua bentuk harus dibaca di sini.
        //    ?error=… (jika user tolak) selalu di query string.
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.slice(1));

        const queryError = searchParams.get("error_description") ?? searchParams.get("error");
        if (queryError) {
          setStatus("error");
          setMessage(queryError);
          return;
        }

        // Fragment flow (#access_token=…) atau query flow (?code=…).
        const code = hashParams.get("access_token") ?? searchParams.get("code");

        if (!code) {
          setStatus("error");
          setMessage(
            "Token otorisasi tidak ditemukan di URL. Facebook mungkin membatalkan otorisasi — coba hubungkan ulang.",
          );
          return;
        }

        // 2. POST code ke callback server (body { code, shopId? }) — server
        //    melakukan validasi state, exchange, connect, dan upsert akun.
        setStatus("posting");
        const res = await api.post<{ redirect?: string }>(
          `/oauth/${platform}/repliz-callback/${state}`,
          { code },
        );

        // 3. Navigasi ke hasil (picker page bila multi-entity, /accounts sukses).
        if (res.redirect) {
          window.location.href = res.redirect;
          return;
        }
        // Fallback: tidak ada redirect — kembali ke halaman akun.
        window.location.href = "/accounts";
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Gagal menyelesaikan koneksi akun via Repliz.",
        );
      }
    })();
  }, [platform, state]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {status === "error" ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
              <span className="text-2xl">!</span>
            </div>
            <h1 className="font-semibold text-lg">Gagal menghubungkan akun</h1>
            <p className="max-w-md break-words text-[var(--text-secondary)] text-sm">{message}</p>
            <a
              href="/accounts"
              className="rounded-[var(--radius-md)] bg-[var(--text)] px-4 py-2 font-medium text-[var(--bg-primary)] text-sm hover:opacity-90"
            >
              Kembali ke Akun
            </a>
          </>
        ) : (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-[var(--border-light)] border-t-2 border-b-2" />
            <h1 className="font-semibold text-lg">Menghubungkan akun…</h1>
            <p className="text-[var(--text-muted)] text-sm">
              {status === "extracting"
                ? "Memproses otorisasi…"
                : "Menyelesaikan koneksi via Repliz…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
