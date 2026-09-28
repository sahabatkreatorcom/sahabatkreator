// Halaman Terima Undangan — publik, dari link email /team/invite/:id
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { useSyncSession } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

export function InviteAcceptPage() {
  useSeo({ title: "Undangan Tim", path: "/team/invite", noIndex: true });

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const syncSession = useSyncSession();
  const [accepted, setAccepted] = useState(false);

  const accept = useMutation({
    mutationFn: async () => {
      // Jika belum login, arahkan login dulu lalu kembali ke sini
      const session = await authClient.getSession();
      if (!session.data) {
        navigate(`/login?redirect=${encodeURIComponent(`/team/invite/${id}`)}`);
        throw new Error("Silakan login terlebih dahulu untuk menerima undangan");
      }
      const { error } = await authClient.organization.acceptInvitation({
        invitationId: id ?? "",
      });
      if (error) throw new Error(error.message ?? "Undangan tidak valid");
    },
    onSuccess: async () => {
      setAccepted(true);
      toast.success("Undangan diterima! Selamat bergabung.");
      // Daftar org di ["me"] berubah setelah accept — sinkronkan cache
      await syncSession();
      navigate("/dashboard", { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-md text-center">
        <Logo size={48} className="mx-auto mb-6" />

        {accepted ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-green-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="font-bold text-2xl">Selamat bergabung!</h1>
            <p className="mt-2 text-[var(--text-secondary)] text-sm">
              Mengalihkan ke dashboard Anda...
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <Mail className="h-8 w-8" />
            </div>
            <h1 className="font-bold text-2xl">Anda Diundang ke Tim</h1>
            <p className="mt-2 text-[var(--text-secondary)] text-sm">
              Anda diundang untuk bergabung ke organisasi di Sahabat Kreator. Masuk untuk menerima
              undangan.
            </p>
            <div className="mt-8 space-y-3">
              <Button
                className="w-full"
                onClick={() => accept.mutate()}
                disabled={accept.isPending}
              >
                {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Terima Undangan
              </Button>
              <Link to="/" className="block">
                <Button variant="ghost" className="w-full">
                  <XCircle className="h-4 w-4" />
                  Nanti Saja
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
