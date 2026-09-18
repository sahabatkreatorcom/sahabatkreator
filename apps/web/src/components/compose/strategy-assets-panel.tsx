// Panel aset strategi di compose — template caption + koleksi hashtag siap pakai
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Hash, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Template = {
  id: string;
  name: string;
  content: string;
  hashtags: string[];
  usageCount: number;
};

type Collection = {
  id: string;
  name: string;
  hashtags: string[];
  usageCount: number;
};

export function StrategyAssetsPanel({
  onApplyTemplate,
  onApplyHashtags,
}: {
  /** Terapkan konten template (replace) + hashtagnya (merge) */
  onApplyTemplate: (content: string, hashtags: string[]) => void;
  /** Tambah hashtag koleksi ke field hashtag (merge, dedupe) */
  onApplyHashtags: (hashtags: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["strategy-assets"],
    queryFn: async () => {
      const [templates, collections] = await Promise.all([
        api.get<{ templates: Template[] }>("/strategy/templates"),
        api.get<{ collections: Collection[] }>("/strategy/hashtag-collections"),
      ]);
      return { templates: templates.templates, collections: collections.collections };
    },
    staleTime: 5 * 60 * 1000,
  });

  const useTemplate = useMutation({
    mutationFn: (id: string) => api.post(`/strategy/templates/${id}/use`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy-assets"] }),
  });

  const useCollection = useMutation({
    mutationFn: (id: string) => api.post(`/strategy/hashtag-collections/${id}/use`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["strategy-assets"] }),
  });

  const templates = data?.templates ?? [];
  const collections = data?.collections ?? [];
  const empty = !isLoading && templates.length === 0 && collections.length === 0;

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Aset Strategi</h2>
        <Link
          to="/assistant/strategi"
          className="flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
        >
          Kelola di Strategi
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-[var(--text-secondary)] text-xs">
        Template & koleksi hashtag dari halaman Strategi Konten
      </p>

      {isLoading ? (
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-[var(--text-muted)]" />
      ) : empty ? (
        <p className="text-[var(--text-muted)] text-xs">
          Belum ada aset — buat di menu Strategi untuk mempercepat compose.
        </p>
      ) : (
        <>
          {templates.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
                <FileText className="h-3.5 w-3.5" /> Template
              </p>
              {templates.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onApplyTemplate(t.content, t.hashtags);
                    useTemplate.mutate(t.id);
                  }}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold-light)]"
                >
                  <span className="line-clamp-1 font-medium">{t.name}</span>
                  <span className="line-clamp-1 text-[10px] text-[var(--text-muted)]">
                    {t.content}
                  </span>
                </button>
              ))}
            </div>
          )}

          {collections.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
                <Hash className="h-3.5 w-3.5" /> Koleksi Hashtag
              </p>
              <div className="flex flex-wrap gap-2">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      onApplyHashtags(col.hashtags);
                      useCollection.mutate(col.id);
                      toast.success(`Hashtag "${col.name}" ditambahkan`);
                    }}
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold-light)]"
                  >
                    #{col.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
