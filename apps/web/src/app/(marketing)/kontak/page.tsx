import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Kontak | Sahabat Kreator",
  description: "Hubungi tim Sahabat Kreator untuk pertanyaan, dukungan, atau kerja sama.",
  robots: {
    index: true,
    follow: true,
  },
};

const contacts = [
  {
    icon: Mail,
    label: "Email",
    value: "support@sahabatkreator.id",
    href: "mailto:support@sahabatkreator.id",
  },
  {
    icon: MessageCircle,
    label: "Live Chat",
    value: "Tersedia di dashboard",
    href: "/login",
  },
  {
    icon: Send,
    label: "Twitter",
    value: "@sahabatkreator",
    href: "https://twitter.com",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Hubungi <span className="text-primary">Kami</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Ada pertanyaan? Butuh bantuan teknis atau ingin bekerja sama? Tim kami siap membantu.
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
            {contacts.map((contact) => (
              <a
                key={contact.label}
                href={contact.href}
                className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center transition-shadow hover:shadow-md"
              >
                <contact.icon className="h-8 w-8 text-primary" />
                <span className="font-semibold">{contact.label}</span>
                <span className="text-sm text-muted-foreground">{contact.value}</span>
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="mx-auto mt-16 max-w-2xl rounded-lg bg-muted p-8 text-center">
            <h2 className="text-2xl font-semibold">Butuh jawaban cepat?</h2>
            <p className="mt-2 text-muted-foreground">
              Banyak pertanyaan sudah terjawab di halaman FAQ.
            </p>
            <Link href="/faq" className="mt-6 inline-block">
              <Button variant="secondary">Lihat FAQ</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
