// Hook kuota AI — dipakai panel asisten AI (compose) dan halaman generator mandiri.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "../lib/query-keys";

export type AiUsage = {
  configured: boolean;
  used: number;
  limit: number;
  period: string;
};

export function useAiUsage() {
  const query = useQuery({
    queryKey: queryKeys.aiUsage,
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
