// Konfigurasi platform social media — label, ikon SVG kustom (lucide v1 tanpa brand icons), warna
import { AtSign, Cloud, Globe, type LucideIcon, MapPin } from "lucide-react";
import type { SVGProps } from "react";

// Ikon brand kustom (path SVG resmi masing-masing platform, disederhanakan)
type BrandIcon = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

function makeBrandIcon(path: string): BrandIcon {
  return function BrandIconComponent(props) {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden {...props}>
        <path d={path} />
      </svg>
    );
  };
}

const InstagramIcon = makeBrandIcon(
  "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1.1-1.5.2-1.9.3-.5.2-.8.4-1.1.7-.3.3-.5.6-.7 1.1-.1.4-.3.8-.3 1.9-.1 1.3-.1 1.6-.1 4.8s0 3.5.1 4.8c.1 1.1.2 1.5.3 1.9.2.5.4.8.7 1.1.3.3.6.5 1.1.7.4.1.8.3 1.9.3 1.3.1 1.6.1 4.8.1s3.5 0 4.8-.1c1.1-.1 1.5-.2 1.9-.3.5-.2.8-.4 1.1-.7.3-.3.5-.6.7-1.1.1-.4.3-.8.3-1.9.1-1.3.1-1.6.1-4.8s0-3.5-.1-4.8c-.1-1.1-.2-1.5-.3-1.9-.2-.5-.4-.8-.7-1.1-.3-.3-.6-.5-1.1-.7-.4-.1-.8-.3-1.9-.3-1.3-.1-1.6-.1-4.8-.1zm0 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6zm0 1.8a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5-2.9a1.1 1.1 0 1 1 0 2.3 1.1 1.1 0 0 1 0-2.3z",
);

const FacebookIcon = makeBrandIcon(
  "M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1c0 6 4.4 11 10.1 11.9v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.3l-.5 3.5h-2.8V24C19.6 23.1 24 18.1 24 12.1z",
);

const TiktokIcon = makeBrandIcon(
  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
);

const YoutubeIcon = makeBrandIcon(
  "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z",
);

const PinterestIcon = makeBrandIcon(
  "M12 0C5.4 0 0 5.4 0 12c0 5.1 3.2 9.4 7.6 11.1-.1-.9-.2-2.3 0-3.3.2-.9 1.4-6 1.4-6s-.4-.7-.4-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.7 1.5 1.6 0 1-.6 2.5-1 3.9-.3 1.1.6 2.1 1.7 2.1 2 0 3.6-2.1 3.6-5.2 0-2.7-2-4.6-4.7-4.6-3.2 0-5.1 2.4-5.1 4.9 0 1 .4 2 .9 2.6.1.1.1.2.1.3l-.3 1.3c0 .2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.6 0-3.8 2.7-7.2 7.9-7.2 4.1 0 7.3 3 7.3 6.9 0 4.1-2.6 7.5-6.2 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1.1-1.1 2.5-1.6 3.4 1.2.4 2.5.6 3.8.6 6.6 0 12-5.4 12-12S18.6 0 12 0z",
);

const LinkedinIcon = makeBrandIcon(
  "M20.4 20.5h-3.5v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6h.1c.5-.9 1.7-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5v6.3zM5.3 7.4a2 2 0 1 1 0-4.1 2 2 0 0 1 0 4.1zM7.1 20.5H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.8v20.5c0 1 .8 1.8 1.8 1.8h20.5c1 0 1.8-.8 1.8-1.8V1.8c0-1-.8-1.8-1.9-1.8z",
);

const ThreadsIcon = makeBrandIcon(
  "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
);

export type Platform =
  | "instagram"
  | "instagram_standalone"
  | "facebook"
  | "threads"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "linkedin"
  | "bluesky"
  | "google_business"
  | "manual";

export type PlatformIcon = LucideIcon | BrandIcon;

export type PlatformConfig = {
  label: string;
  icon: PlatformIcon;
  color: string;
  /** Status kesiapan integrasi (untuk pengajuan API) */
  status: "ready" | "pending" | "manual";
};

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  instagram: {
    label: "Instagram",
    icon: InstagramIcon,
    color: "#E4405F",
    status: "ready",
  },
  instagram_standalone: {
    // Jalur IG Login (tanpa FB Page) — label dibedakan agar user paham dua mode koneksi
    label: "Instagram (Akun Bisnis)",
    icon: InstagramIcon,
    color: "#E4405F",
    status: "ready",
  },
  facebook: {
    label: "Facebook",
    icon: FacebookIcon,
    color: "#1877F2",
    status: "ready",
  },
  threads: {
    label: "Threads",
    icon: ThreadsIcon,
    // Hitam asli tak terlihat di dark mode → ikuti warna teks tema
    color: "var(--text-primary)",
    status: "ready",
  },
  tiktok: {
    label: "TikTok",
    icon: TiktokIcon,
    // Hitam asli tak terlihat di dark mode → ikuti warna teks tema
    color: "var(--text-primary)",
    status: "ready",
  },
  youtube: {
    label: "YouTube",
    icon: YoutubeIcon,
    color: "#FF0000",
    status: "ready",
  },
  pinterest: {
    label: "Pinterest",
    icon: PinterestIcon,
    color: "#E60023",
    status: "ready",
  },
  linkedin: {
    label: "LinkedIn",
    icon: LinkedinIcon,
    color: "#0A66C2",
    status: "ready",
  },
  bluesky: {
    label: "Bluesky",
    icon: Cloud,
    color: "#0285FF",
    status: "ready",
  },
  google_business: {
    label: "Google Business",
    icon: MapPin,
    color: "#4285F4",
    status: "ready",
  },
  manual: {
    label: "Manual",
    icon: Globe,
    color: "#6B6B6B",
    status: "manual",
  },
};

export function platformConfig(platform: string): PlatformConfig {
  return PLATFORMS[platform as Platform] ?? PLATFORMS.manual;
}

// AtSign dipakai di halaman engagement untuk mention
export { AtSign };
