// Banner impersonasi — tampil saat admin bertindak sebagai user lain (M13).
// Fetch status saat mount; bila aktif tampil banner merah fixed di atas
// dengan tombol keluar impersonasi.
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type ImpersonationStatus = {
  active: boolean;
  adminEmail: string | null;
  userEmail: string | null;
};

// Query options dibagikan — banner & layout dashboard memakai cache yang sama
export const impersonationStatusOptions = queryOptions({
  queryKey: ["impersonation-status"],
  queryFn: () => api.get<ImpersonationStatus>("/admin/impersonate/status"),
  // Bila endpoint error — diamkan saja, tidak perlu banner
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
});

export function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const { data } = useQuery(impersonationStatusOptions);

  const exitImpersonation = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/admin/impersonate/exit"),
    onSuccess: () => {
      // Bersihkan cache query — data user/org sudah berganti
      queryClient.clear();
      toast.success("Keluar dari sesi impersonasi");
      window.location.href = "/admin/users";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-10 items-center justify-center gap-3 bg-red-600 px-4 font-medium text-sm text-white shadow-lg">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="truncate">
        Anda bertindak sebagai <span className="font-semibold">{data.userEmail ?? "?"}</span>
        {data.adminEmail ? ` — oleh ${data.adminEmail}` : ""}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 shrink-0 px-3 text-xs"
        onClick={() => exitImpersonation.mutate()}
        disabled={exitImpersonation.isPending}
      >
        <X className="h-3.5 w-3.5" />
        Keluar
      </Button>
    </div>
  );
}
