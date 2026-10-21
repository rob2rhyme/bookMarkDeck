import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bookmark Deck",
    short_name: "BookmarkDeck",
    description:
      "Your frequently used sites, app shortcuts, and a focused-work hub — fast, simple, private.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#020617",
    // Android's Share sheet lists the installed app; a shared link opens /share
    // to be saved. GET keeps it a plain page — no service-worker handler needed.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
