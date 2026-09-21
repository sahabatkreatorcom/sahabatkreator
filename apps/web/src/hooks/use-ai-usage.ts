// Hook kuota AI — dipakai panel asisten AI (compose) dan halaman generator mandiri.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AiUsage = {
  configured: boolean;
  used: number;
  limit: number;
  period: string;
};

export function useAiUsage() {
  const query = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<AiUsage>("/ai/usage"),
  });

  const usage = query.data;

  return {
    usage,
    /** AI tidak bisa dipakai — belum dikonfigurasi admin atau kuota habis */
    disabled: !usage?.configured || usage.limit === 0,
    refetchUsage: () => void query.refetch(),
  };
}
