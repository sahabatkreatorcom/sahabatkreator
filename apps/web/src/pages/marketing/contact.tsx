// Halaman Kontak — form + info kontak
import { Mail, MapPin, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { useSeo } from "@/lib/seo";

export function ContactPage() {
  useSeo({
    title: "Kontak — Hubungi Tim Sahabat Kreator",
    description:
      "Ada pertanyaan atau masukan? Hubungi tim Sahabat Kreator melalui email atau form kontak. Kami membalas dalam 1-2 hari kerja.",
    path: "/kontak",
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      <div className="mb-12 text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Ada yang bisa kami <span className="text-gradient">bantu</span>?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)] text-lg">
          Tim kami membalas dalam 1-2 hari kerja.
        </p>
      </div>

      <div className="grid gap-10 md:grid-cols-3">
        {/* Info kontak */}
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Email</h3>
              <p className="text-[var(--text-secondary)] text-sm">halo@sahabatkreator.com</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Dukungan</h3>
              <p className="text-[var(--text-secondary)] text-sm">Senin-Jumat, 09.00-17.00 WIB</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Lokasi</h3>
              <p className="text-[var(--text-secondary)] text-sm">Jakarta, Indonesia</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="card p-6 md:col-span-2">
          {sent ? (
            <div className="py-10 text-center">
              <h2 className="font-semibold text-xl">Terima kasih!</h2>
              <p className="mt-2 text-[var(--text-secondary)] text-sm">
                Pesan Anda sudah kami terima. Kami akan segera membalas ke email Anda.
              </p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setSubmitting(true);
                try {
                  await api.post("/contact", { name, email, message });
                  setSent(true);
                } catch (err) {
                  setError(
                    err instanceof ApiError
                      ? err.message
                      : "Gagal mengirim pesan. Coba lagi nanti.",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama</Label>
                  <Input
                    id="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Anda"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Pesan</Label>
                <Textarea
                  id="message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ceritakan kebutuhan Anda..."
                />
              </div>
              {error && (
                <p className="text-red-500 text-sm" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? "Mengirim..." : "Kirim Pesan"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
