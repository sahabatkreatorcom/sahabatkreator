"use client";

import * as React from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const faqs = [
  {
    category: "Umum",
    question: "Apa itu Sahabat Kreator?",
    answer:
      "Sahabat Kreator adalah platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia. Anda bisa menjadwalkan konten, balas komentar, pantau analitik, dan dapatkan rekomendasi AI dalam satu dashboard.",
  },
  {
    category: "Umum",
    question: "Platform apa saja yang didukung?",
    answer:
      "Kami mendukung 12 platform: Instagram, Instagram Page, Facebook, TikTok, YouTube, Pinterest, Google Business, LinkedIn, Bluesky, Threads, dan posting manual. Delapan di antaranya sudah bisa publish langsung.",
  },
  {
    category: "Harga",
    question: "Apakah ada masa percobaan gratis?",
    answer:
      "Ya! Semua paket berbayar termasuk 14 hari gratis tanpa memerlukan kartu kredit. Paket Free tersedia permanen untuk mulai mencoba.",
  },
  {
    category: "Harga",
    question: "Bagaimana cara membatalkan subscription?",
    answer:
      "Anda bisa membatalkan subscription kapan saja dari halaman Billing di dashboard. Akses tetap aktif hingga akhir cycle billing saat ini.",
  },
  {
    category: "Fitur",
    question: "Apa itu Seb AI?",
    answer:
      "Seb adalah asisten AI bawaan. Seb bisa membuat laporan strategi 90 hari, memberi rekomendasi konten, menjawab pertanyaan tentang akun Anda lewat chat, menganalisis media, dan membaca website brand Anda.",
  },
  {
    category: "Fitur",
    question: "Bagaimana cara connect akun sosial media?",
    answer:
      "Masuk ke dashboard, buka Pengaturan > Koneksi Akun, lalu pilih platform. Anda akan diarahkan ke OAuth resmi masing-masing platform. Token disimpan terenkripsi.",
  },
  {
    category: "Keamanan",
    question: "Apakah data saya aman?",
    answer:
      "Keamanan adalah prioritas kami: token sosial dienkripsi AES-256-GCM, dukungan 2FA (TOTP dan email OTP), dan media disimpan di Cloudflare R2. Data Anda tidak dijual ke pihak ketiga.",
  },
  {
    category: "Tim",
    question: "Bisa digunakan untuk tim?",
    answer:
      "Ya! Paket Pro ke atas mendukung anggota tim. Paket Business mendukung hingga 15 member dengan peran Owner, Admin, Member, dan Viewer, plus jejak aktivitas tim.",
  },
  {
    category: "Dukungan",
    question: "Apakah ada dukungan Bahasa Indonesia?",
    answer:
      "Tentu! Sahabat Kreator didesain khusus untuk kreator Indonesia dengan UI dan dukungan dalam Bahasa Indonesia.",
  },
  {
    category: "Dukungan",
    question: "Bagaimana cara menghubungi support?",
    answer:
      "Anda bisa menghubungi kami lewat halaman Kontak, email ke support@sahabatkreator.com, atau lihat FAQ ini untuk jawaban cepat.",
  },
];

const CATEGORIES = ["Semua", ...Array.from(new Set(faqs.map((f) => f.category)))];

export default function DashboardFAQPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = faqs.filter((faq) => {
    if (category !== "Semua" && faq.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q) ||
        faq.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Pusat Bantuan</h1>
        <p className="text-sm text-muted-foreground">Temukan jawaban untuk pertanyaan umum tentang Sahabat Kreator.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pertanyaan..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                category === cat
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Tidak ada hasil untuk "{search}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((faq, i) => {
            const id = `faq-${i}`;
            const isOpen = openId === id;
            return (
              <div key={id} className="rounded-lg border border-border bg-card">
                <button
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50"
                  onClick={() => setOpenId(isOpen ? null : id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {faq.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{faq.question}</p>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Belum menemukan jawaban?{" "}
          <a href="/kontak" className="font-medium text-primary hover:underline">
            Hubungi kami
          </a>
        </p>
      </div>
    </div>
  );
}
