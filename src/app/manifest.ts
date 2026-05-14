import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Stake Manager",
    short_name: "Stake",
    description: "Gestione conti gioco, scommesse e movimenti",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0B1224",
    theme_color: "#0B1224",
    orientation: "portrait-primary",
    lang: "it",
    categories: ["finance", "sports"],
    icons: [
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
