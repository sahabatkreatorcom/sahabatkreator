// Halaman Buat Organisasi — wizard untuk user tanpa org

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { authClient } from "@/lib/auth-client";
import { useSeo } from "@/lib/seo";

export function CreateOrgPage() {
  useSeo({ title: "Buat Organisasi", path: "/create-organization", noIndex: true });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 24)}-${Date.now().toString(36).slice(-4)}`;

    setLoading(true);
    const { data, error } = await authClient.organization.create({ name, slug });

    if (error || !data) {
      toast.error(error?.message ?? "Gagal membuat organisasi");
      setLoading(false);
      return;
    }

    await authClient.organization.setActive({ organizationId: data.id });
    // Invalidate cache sesi/daftar org — tanpa ini dashboard masih memakai
    // data ["me"] lama (staleTime 60s) sehingga org baru tidak terlihat
    // sampai manual refresh.
    queryClient.invalidateQueries();
    toast.success(`Organisasi "${name}" berhasil dibuat!`);
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo size={48} className="mx-auto mb-4" />
          <h1 className="font-bold text-2xl">Buat Organisasi Anda</h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            Organisasi adalah ruang kerja untuk tim dan konten Anda. Anda bisa membuat lebih dari
            satu.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nama Organisasi</Label>
            <Input
              id="org-name"
              placeholder="mis. Kreator Pribadi / Nama Brand"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Buat Organisasi
          </Button>
        </form>
      </div>
    </div>
  );
}
