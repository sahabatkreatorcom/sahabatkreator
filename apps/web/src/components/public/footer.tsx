import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { PlatformIcon } from "@/components/ui/platform-icon";

export function Footer() {
  return (
    <footer className="border-t border-border py-12 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <Logo size={24} />
              <span className="font-semibold">Sahabat Kreator</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Platform manajemen media sosial AI-powered untuk kreator Indonesia.
            </p>
          </div>
          <div>
            <h4 className="font-semibold">Produk</h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link href="/fitur" className="text-muted-foreground hover:text-foreground">
                  Fitur
                </Link>
              </li>
              <li>
                <Link href="/harga" className="text-muted-foreground hover:text-foreground">
                  Harga
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-muted-foreground hover:text-foreground">
                  Blog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Perusahaan</h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link href="/tentang" className="text-muted-foreground hover:text-foreground">
                  Tentang Kami
                </Link>
              </li>
              <li>
                <Link href="/karir" className="text-muted-foreground hover:text-foreground">
                  Karir
                </Link>
              </li>
              <li>
                <Link href="/kontak" className="text-muted-foreground hover:text-foreground">
                  Kontak
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Legal & Ikuti Kami</h4>
            <ul className="mt-4 space-y-2 text-sm mb-4">
              <li>
                <Link href="/kebijakan-privasi" className="text-muted-foreground hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/syarat-ketentuan" className="text-muted-foreground hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
            </ul>
            <div className="flex gap-4">
              <Link href="#" className="text-muted-foreground hover:text-primary"><PlatformIcon platform="INSTAGRAM" size={20} /></Link>
              <Link href="#" className="text-muted-foreground hover:text-primary"><PlatformIcon platform="FACEBOOK" size={20} /></Link>
              <Link href="#" className="text-muted-foreground hover:text-primary"><PlatformIcon platform="THREADS" size={20} /></Link>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Sahabat Kreator. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
