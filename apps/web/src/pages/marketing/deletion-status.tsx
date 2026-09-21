// Halaman status penghapusan data end-user (data deletion callback Meta/IG/Threads).
// URL dikirim ke platform sebagai confirmation URL: /penghapusan-data/status?code=SK-DEL-xxx
// Publik — tanpa login, code acak 10 hex sehingga tidak bisa di-enumerate.
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useSeo } from "@/lib/seo";

type DeletionStatus = {
  status: "deleted" | "not_found";
  deletedItems: number;
  completedAt: string | null;
};

function fetchDeletionStatus(code: string): Promise<DeletionStatus> {
  return api.get<DeletionStatus>(`/deletion-status/${code}`);
}

export function DeletionStatusPage() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";

  useSeo({
    title: "Status Penghapusan Data",
    description: "Status permintaan penghapusan data Anda dari Sahabat Kreator.",
    path: "/penghapusan-data/status",
    noIndex: true,
  });

  const { data, isPending, isError } = useQuery({
    queryKey: ["deletion-status", code],
    queryFn: () => fetchDeletionStatus(code),
    enabled: code.length > 0,
    retry: false,
  });

  if (!code) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <EmptyState
          icon="alert"
          title="Kode konfirmasi tidak ada"
          description="Halaman ini memerlukan kode konfirmasi dari permintaan penghapusan data. Periksa kembali tautan yang Anda terima."
          action={
            <Link to="/penghapusan-data">
              <Button variant="outline">Cara Menghapus Data</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <p className="text-[var(--text-muted)]">Memeriksa status…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <EmptyState
          icon="alert"
          title="Kode konfirmasi tidak valid"
          description="Kode yang Anda masukkan tidak ditemukan. Periksa kembali tautan dari platform, atau hubungi kami bila merasa ini keliru."
          action={
            <Link to="/kontak">
              <Button variant="outline">Hubungi Kami</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isDeleted = data.status === "deleted";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="font-bold text-3xl md:text-4xl">Status Penghapusan Data</h1>

      <div
        className={`mt-8 rounded-[var(--radius-lg)] border p-6 ${
          isDeleted
            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
            : "border-[var(--border-light)] bg-[var(--bg-tertiary)]"
        }`}
      >
        <p className="font-semibold text-lg">
          {isDeleted ? "Data Anda telah dihapus" : "Tidak ada data yang tersimpan"}
        </p>
        <p className="mt-2 text-[var(--text-secondary)] text-sm leading-relaxed">
          {isDeleted
            ? `Permintaan penghapusan data Anda telah selesai diproses. Sebanyak ${data.deletedItems} item data terkait aktivitas Anda (komentar, pesan, atau percakapan) telah dihapus permanen dari sistem kami.`
            : "Kami tidak menyimpan data apa pun terkait permintaan ini — baik komentar, pesan, maupun percakapan yang terkait akun Anda. Tidak ada tindakan lebih lanjut yang diperlukan."}
        </p>
        {data.completedAt && (
          <p className="mt-3 text-[var(--text-muted)] text-xs">
            Diproses pada: {new Date(data.completedAt).toLocaleString("id-ID")}
          </p>
        )}
        <p className="mt-4 font-mono text-[var(--text-muted)] text-xs">Kode konfirmasi: {code}</p>
      </div>

      <div className="mt-10 text-[var(--text-muted)] text-sm">
        <p>
          Konten yang sudah tayang di platform social media tidak terpengaruh — pengelolaannya
          kembali ke platform masing-masing. Pertanyaan lebih lanjut?{" "}
          <Link to="/kontak" className="text-[var(--accent-gold)] underline">
            Hubungi kami
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
