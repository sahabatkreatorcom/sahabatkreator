import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
    title: "Sahabat Kreator",
    description: "AI-powered social media management untuk brand & agency",
    icons: {
        icon: [
            { url: "/favicon/favicon.ico", sizes: "any" },
            { url: "/favicon/favicon-96x96.png", type: "image/png", sizes: "96x96" },
            { url: "/favicon/favicon.svg", type: "image/svg+xml" },
        ],
        apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/favicon/site.webmanifest",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Sahabat Kreator",
    },
};

// Script inline mencegah "flash" tema salah sebelum React hydrate.
const noFlashScript = `
(function () {
  try {
    var stored = localStorage.getItem("sahabat-kreator-theme") || "system";
    var isDark = stored === "dark" || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
            </head>
            <body>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}