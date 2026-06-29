import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest). Next automatically emits
// the <link rel="manifest"> into <head> because this metadata route exists.
// Kept intentionally minimal — installability only, no caching/offline scope.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dovetails FSM",
    short_name: "Dovetails",
    description: "Dovetails Services LLC — field service management",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
