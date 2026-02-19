import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI-FSM",
  description: "AI-built field service app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
