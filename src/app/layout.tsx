import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
import { LuzVidro } from "@/components/LuzVidro";
import { RegistraServiceWorker } from "@/components/RegistraServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adega do Pezão",
  description: "Caixa, produtos e lucro da Adega do Pezão",
  applicationName: "Adega do Pezão",
  appleWebApp: {
    capable: true,
    title: "Pezão",
    // O conteúdo passa por baixo da barra de status; o topo de cada tela respeita a área segura.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // "cover" deixa o app ocupar a tela toda no PWA; o espaço do notch e da
  // barra de gestos é respeitado com env(safe-area-inset-*) no CSS.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Shell>{children}</Shell>
        <LuzVidro />
        <RegistraServiceWorker />
      </body>
    </html>
  );
}
