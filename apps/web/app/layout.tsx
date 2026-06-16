import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

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
  themeColor: "#111827",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
