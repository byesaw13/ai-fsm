import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

// Archivo — matches the Dovetails marketing site (mydovetails-site uses
// 'Archivo Variable'). Exposed as --font-archivo; tokens.css --font-sans
// consumes it with a system fallback so an offline build still renders.
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Dovetails",
  description: "Dovetails Services LLC — field service management",
  appleWebApp: {
    capable: true,
    title: "Dovetails",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Browser chrome / PWA status bar — burnt-orange brand, not legacy slate.
  themeColor: "#c1540f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
