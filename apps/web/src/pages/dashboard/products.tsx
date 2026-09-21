// Katalog Produk — CRUD produk UMKM untuk di-tag ke konten
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  isActive: boolean;
};

function formatPrice(price: string, currency: string): string {
  const value = Number(price);
  if (currency === "IDR") {
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("en-US")}`;
}

/** Form produk (buat/edit) */
function ProductForm({ initial, onDone }: { initial?: Product; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? Number(initial.price) : 0);
  const [currency, setCurrency] = useState(initial?.currency ?? "IDR");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [productUrl, setProductUrl] = useState(initial?.productUrl ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || null,
        price,
        currency,
        imageUrl: imageUrl || null,
        productUrl: productUrl || null,
      };
      if (initial) return api.patch(`/commerce/products/${initial.id}`, body);
      return api.post("/commerce/products", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(initial ? "Produk diperbarui" : "Produk ditambahkan");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (price <= 0) {
          toast.error("Harga harus lebih dari 0");
          return;
        }
        save.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <PackagePlus className="h-4 w-4" />
        {initial ? `Edit: ${initial.name}` : "Tambah Produk"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="prod-name">Nama Produk</Label>
          <Input
            id="prod-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth: Keripik Singkong Balado 250gr"
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prod-currency">Mata Uang</Label>
          <Select id="prod-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="IDR">IDR (Rp)</option>
            <option value="USD">USD ($)</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="prod-price">Harga</Label>
          <Input
            id="prod-price"
            type="number"
            min={0}
            step={currency === "IDR" ? 100 : 0.01}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prod-url">Link Produk (opsional)</Label>
          <Input
            id="prod-url"
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://tokoku.com/produk"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prod-image">URL Gambar (opsional)</Label>
        <Input
          id="prod-image"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://... (upload dulu di halaman Media)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="prod-desc">Deskripsi (opsional)</Label>
        <Textarea
          id="prod-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Simpan" : "Tambah"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
      </div>
    </form>
  );
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["products", q],
    queryFn: () =>
      api.get<{ items: Product[] }>(
        `/commerce/products?all=true${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      ),
  });

  const toggleActive = useMutation({
    mutationFn: (prod: Product) =>
      api.patch(`/commerce/products/${prod.id}`, { isActive: !prod.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/commerce/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produk dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const editing = items.find((p) => p.id === editingId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Katalog Produk</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Kelola produk untuk di-tag ke konten — tampil di shopping tag &amp; link UTM.
          </p>
        </div>
        {!showForm && !editing && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Button>
        )}
      </div>

      {showForm && !editing && <ProductForm onDone={() => setShowForm(false)} />}
      {editing && <ProductForm initial={editing} onDone={() => setEditingId(null)} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari produk..."
          className="pl-9"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 && !showForm ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
            <Package className="h-6 w-6" />
          </div>
          <h2 className="font-semibold">Belum ada produk</h2>
          <p className="max-w-sm text-[var(--text-secondary)] text-sm">
            Tambahkan produk UMKM Anda untuk di-tag ke konten — pembeli bisa langsung melihat harga
            &amp; link produk.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Tambah Produk Pertama
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((prod) => (
            <div key={prod.id} className="card flex gap-3 p-4">
              {prod.imageUrl ? (
                <img
                  src={prod.imageUrl}
                  alt={prod.name}
                  className="h-20 w-20 shrink-0 rounded-[var(--radius-md)] object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <Package className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{prod.name}</p>
                    <p className="font-semibold text-[var(--accent-gold)] text-sm">
                      {formatPrice(prod.price, prod.currency)}
                    </p>
                  </div>
                  <Badge variant={prod.isActive ? "success" : "secondary"}>
                    {prod.isActive ? "aktif" : "nonaktif"}
                  </Badge>
                </div>
                {prod.description && (
                  <p className="mt-1 line-clamp-2 text-[var(--text-secondary)] text-xs">
                    {prod.description}
                  </p>
                )}
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(prod.id)}>
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive.mutate(prod)}
                    disabled={toggleActive.isPending}
                  >
                    {prod.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => {
                      if (confirm(`Hapus produk "${prod.name}"?`)) remove.mutate(prod.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
