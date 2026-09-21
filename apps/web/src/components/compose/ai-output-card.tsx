// Kartu hasil AI mandiri (Repurpose/Carousel) — copy hasil atau bawa ke Composer
import { Copy, PenSquare } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AiOutputCard({ title, content }: { title: string; content: string }) {
  const navigate = useNavigate();

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(content);
            toast.success("Hasil dicopy");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-secondary)] text-sm">
        {content}
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => navigate("/compose", { state: { content } })}
      >
        <PenSquare className="h-4 w-4" />
        Buka di Composer
      </Button>
    </div>
  );
}
