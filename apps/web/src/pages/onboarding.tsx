// Halaman Onboarding — wizard setup awal untuk user baru tanpa akun sosmed terhubung
// Step 1 Welcome → Step 2 Hubungkan akun → Step 3 Buat post pertama → Step 4 Selesai
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PenSquare,
  Rocket,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PLATFORMS, type Platform } from "@/lib/platforms";

/** Platform yang bisa di-OAuth connect (manual & bluesky punya alur khusus di halaman accounts) */
const CONNECTABLE: Platform[] = [
  "instagram",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "linkedin_org",
  "google_business",
];

const ONBOARDING_DONE_KEY = "sk-onboarding-done";

/** Tandai onboarding selesai (localStorage — ringan, tidak perlu simpan server) */
export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // localStorage bisa diblokir (private mode strict) — abaikan, banner hanya hilang sesi ini
  }
}

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

const STEPS = ["Selamat Datang", "Hubungkan Akun", "Post Pertama", "Selesai"] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Status akun — dipakai step 2 (tombol Lanjut aktif setelah ≥1 akun terhubung)
  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () =>
      api.get<{ accounts: Array<{ platform: string; isConnected: boolean }> }>("/accounts"),
  });
  const accounts = data?.accounts ?? [];
  const connectedCount = accounts.filter((a) => a.isConnected).length;

  async function startConnect(platform: string) {
    setConnecting(platform);
    try {
      const { authorizeUrl } = await api.get<{ authorizeUrl: string }>(`/oauth/${platform}/start`);
      window.location.href = authorizeUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai koneksi");
      setConnecting(null);
    }
  }

  function finish() {
    markOnboardingDone();
    navigate("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      {/* Progress steps */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full font-semibold text-xs ${
                i < step
                  ? "bg-[var(--accent-gold)] text-white"
                  : i === step
                    ? "border-2 border-[var(--accent-gold)] text-[var(--accent-gold)]"
                    : "border border-[var(--border)] text-[var(--text-muted)]"
              }`}
              title={label}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 rounded ${i < step ? "bg-[var(--accent-gold)]" : "bg-[var(--border)]"}`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="card p-8">
        {/* ---------- Step 1: Welcome ---------- */}
        {step === 0 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-gold-light)]">
              <Rocket className="h-8 w-8 text-[var(--accent-gold)]" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">Selamat datang di Sahabat Kreator</h1>
              <p className="mt-2 text-[var(--text-secondary)]">
                Semua yang Anda butuhkan untuk mengelola konten social media — dalam satu tempat.
              </p>
            </div>
            <div className="grid gap-4 text-left sm:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <CalendarClock className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">Jadwal otomatis</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Atur sekali, posting terkirim tepat waktu di semua platform.
                </p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">AI caption</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Generate caption & hashtag yang sesuai gaya brand Anda.
                </p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <BarChart3 className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">Analitik lengkap</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Pantau performa semua akun dari satu dashboard.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Step 2: Hubungkan akun ---------- */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-bold text-2xl">Hubungkan akun pertama Anda</h1>
              <p className="mt-1 text-[var(--text-secondary)] text-sm">
                Pilih platform untuk mulai posting. Anda bisa menambahkan platform lain nanti.
              </p>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {CONNECTABLE.map((key) => {
                  const cfg = PLATFORMS[key];
                  const Icon = cfg.icon;
                  const connected = accounts.some((a) => a.platform === key && a.isConnected);
                  const isConnecting = connecting === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => startConnect(key)}
                      disabled={connected || isConnecting}
                      className={`flex items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
                        connected
                          ? "border-[var(--success)] bg-[var(--success)]/5"
                          : "border-[var(--border)] hover:border-[var(--accent-gold)] hover:bg-[var(--bg-tertiary)]"
                      }`}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${cfg.color}1a` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: cfg.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{cfg.label}</p>
                        <p className="text-[var(--text-muted)] text-xs">
                          {connected ? "Terhubung" : isConnecting ? "Membuka..." : "Hubungkan"}
                        </p>
                      </div>
                      {connected && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[var(--text-muted)] text-xs">
              Sudah terhubung: <span className="font-medium">{connectedCount}</span> akun — Bluesky
              & akun manual bisa ditambahkan dari halaman{" "}
              <Link to="/accounts" className="text-[var(--accent-gold)] hover:underline">
                Akun Sosmed
              </Link>
              .
            </p>
          </div>
        )}

        {/* ---------- Step 3: Buat post pertama ---------- */}
        {step === 2 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-gold-light)]">
              <PenSquare className="h-8 w-8 text-[var(--accent-gold)]" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">Buat post pertama Anda</h1>
              <p className="mt-2 text-[var(--text-secondary)]">
                Mulai dari draft sederhana — Anda bisa menjadwalkannya kapan saja.
              </p>
            </div>
            <div className="mx-auto max-w-md space-y-2 text-left">
              {[
                "Tulis caption, atau gunakan AI caption untuk ide cepat",
                "Unggah foto/video dari library atau perangkat Anda",
                "Pilih waktu tayang — sisanya biar kami yang urus",
              ].map((tip) => (
                <div
                  key={tip}
                  className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--bg-secondary)] p-3"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
                  <p className="text-[var(--text-secondary)] text-sm">{tip}</p>
                </div>
              ))}
            </div>
            <Link to="/compose">
              <Button>
                <PenSquare className="h-4 w-4" />
                Buka Editor Konten
              </Button>
            </Link>
          </div>
        )}

        {/* ---------- Step 4: Selesai ---------- */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--success)]/10">
              <CheckCircle2 className="h-8 w-8 text-[var(--success)]" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">Setup selesai!</h1>
              <p className="mt-2 text-[var(--text-secondary)]">
                Beberapa hal yang bisa Anda lakukan selanjutnya:
              </p>
            </div>
            <div className="grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <Users className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">Undang tim</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Kolaborasi dengan anggota tim & pembuat konten.
                </p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <BarChart3 className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">Atur goal</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Tetapkan target follower & engagement untuk dilacak.
                </p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-light)] p-4">
                <UserPlus className="h-5 w-5 text-[var(--accent-gold)]" />
                <p className="mt-2 font-medium text-sm">Install app</p>
                <p className="mt-1 text-[var(--text-muted)] text-xs">
                  Tambahkan ke home screen untuk akses cepat & notifikasi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Navigasi ---------- */}
        <div className="mt-8 flex items-center justify-between border-[var(--border-light)] border-t pt-5">
          <Button
            variant="ghost"
            onClick={() => (step > 0 ? setStep(step - 1) : navigate("/dashboard"))}
          >
            <ArrowLeft className="h-4 w-4" />
            {step > 0 ? "Kembali" : "Lewati"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && connectedCount === 0}
              title={
                step === 1 && connectedCount === 0 ? "Hubungkan minimal satu akun dulu" : undefined
              }
            >
              Lanjut
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish}>
              <Rocket className="h-4 w-4" />
              Mulai Buat Konten
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
