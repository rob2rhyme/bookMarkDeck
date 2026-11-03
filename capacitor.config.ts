import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS shell for Bookmark Deck. Rather than bundle a static export (this is
// an SSR Next.js app with API routes + next-auth), the shell loads the live
// deployed site and layers a native, time-sensitive timer notification on top
// (see CAPACITOR_IOS.md). Change `server.url` to your own deployment domain.
const config: CapacitorConfig = {
  appId: "app.rob2rhyme.bmarkdeck",
  appName: "Bookmark Deck",
  webDir: "public", // not served at runtime (we load server.url) but required by the config
  server: {
    url: "https://bmarkdeck.rob2rhyme.app",
    cleartext: false,
    // Airplane Mode is the first thing App Review tries. With `server.url` the
    // webview has no page of its own, so a failed load would be a blank error;
    // this local page (copied from `webDir`) is shown instead. Its "Try again"
    // goes back to the live site — see public/offline.html, and
    // src/lib/capacitorShell.test.ts, which keeps the two addresses in step.
    errorPath: "offline.html",
  },
};

export default config;
