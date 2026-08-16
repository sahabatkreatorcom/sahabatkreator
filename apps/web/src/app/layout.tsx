import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
    title: "Sahabat Kreator",
    description: "AI-powered social media management untuk brand & agency",
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