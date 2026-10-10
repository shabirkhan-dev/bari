import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      // Updates install silently on next open — no reinstall for members.
      registerType: "autoUpdate",
      manifest: {
        name: "Committee OS",
        short_name: "Committee",
        description: "Bachat committee tracker — we manage the committee; JazzCash moves the money.",
        lang: "en-PK",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: []
      }
    })
  ],
});
