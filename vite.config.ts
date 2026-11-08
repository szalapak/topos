import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative paths so the build works from any sub-path, e.g. GitHub Pages.
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Topos",
        short_name: "Topos",
        description: "How many countries do you know? Take a quick quiz, then learn the rest with spaced repetition.",
        theme_color: "#1d4e6b",
        background_color: "#0f2433",
        display: "standalone",
        // PNGs generated from public/icon.svg with `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`.
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json,png,ico}"],
        maximumFileSizeToCacheInBytes: 2_000_000,
      },
    }),
  ],
});
