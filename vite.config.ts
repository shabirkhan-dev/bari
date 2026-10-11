import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/sw.ts): offline shell + the Android share target.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Updates install silently on next open — no reinstall for members.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        // The OCR engine (15 MB) downloads only when someone attaches a receipt.
        globIgnores: ["ocr/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      manifest: {
        id: "/",
        name: "Bari",
        short_name: "Bari",
        description: "Har ek ki bari aati hai. Your bachat committee, kept honest.",
        lang: "en-PK",
        start_url: "/",
        display: "standalone",
        background_color: "#0F5F4F",
        theme_color: "#0F5F4F",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        // JazzCash → Share → Bari
        share_target: {
          action: "/share-receipt",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [{ name: "receipt", accept: ["image/*", "application/pdf"] }]
          }
        }
      }
    })
  ]
});
