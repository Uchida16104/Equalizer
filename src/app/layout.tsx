import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Equalizer Studio — Live FFT Audio Visualizer",
  description:
    "Production-ready p5.js FFT audio visualizer with per-band gain control, built with Next.js, Alpine.js, HTMX, and Tailwind CSS.",
  authors: [{ name: "Hirotoshi Uchida" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="bg-[#0a0a0f] text-[#e2e8f0] min-h-screen antialiased">
        {children}

        <Script
          src="https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js"
          strategy="afterInteractive"
        />
        <Script
          src="https://unpkg.com/hyperscript.org@0.9.12"
          strategy="afterInteractive"
        />
        <Script
          src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js"
          defer
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
