// ProductPicker — pilih produk katalog untuk di-tag ke konten
// Produk terpilih dikirim sebagai productIds di payload post; server membuat
// productTag (snapshot denormalized) untuk tiap post di group.
import { useQuery } from "@tanstack/react-query";
import { Package, Search, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export type CatalogProduct = {
  id: string;
  name: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  isActive: boolean;
};

function formatPrice(price: string, currency: string): string {
  const value = Number(price);
  return currency === "IDR"
    ? `Rp ${value.toLocaleString("id-ID")}`
    : `${currency} ${value.toLocaleString("en-US")}`;
}

export function ProductPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["products", q],
    queryFn: () =>
      api.get<{ items: CatalogProduct[] }>(
        `/commerce/products${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ),
    staleTime: 60_000,
  });

  const items = (data?.items ?? []).filter((p) => p.isActive);
  const selected = items.filter((p) => selectedIds.includes(p.id));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Package className="h-4 w-4" />
        Tag Produk
      </h2>
      <p className="mb-4 text-[var(--text-muted)] text-xs">
        Tandai produk yang tampil di konten ini — informasi produk disertakan saat publish (shopping
        tag) dan bisa dipakai untuk link UTM.
      </p>

      {/* Chip terpilih */}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full bg-[var(--accent-gold-light)] px-2.5 py-1 font-medium text-[var(--accent-gold)] text-xs"
            >
              {p.name}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-label={`Hapus ${p.name}`}
                className="hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari produk..."
          className="h-9 pl-9 text-sm"
        />
      </div>

      {/* List */}
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[var(--text-muted)] text-xs">
            {q
              ? "Tidak ada produk cocok."
              : "Belum ada produk aktif. Tambahkan di halaman Katalog Produk."}
          </p>
        ) : (
          items.slice(0, 20).map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left text-sm ${
                  isSelected ? "bg-[var(--accent-gold-light)]" : "hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                    <Package className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-[var(--text-muted)] text-xs">
                    {formatPrice(p.price, p.currency)}
                  </span>
                </span>
                {isSelected && (
                  <span className="shrink-0 font-medium text-[10px] text-[var(--accent-gold)]">
                    terpilih
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
