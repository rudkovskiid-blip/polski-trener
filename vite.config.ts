import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// База для GitHub Pages: при деплое на project-site задать VITE_BASE="/<имя-репозитория>/".
// Локально и на корневом домене оставляем "/".
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Польский тренажёр — экзамен на ПМЖ",
        short_name: "Польский",
        description:
          "Офлайн-тренажёр для подготовки к устному экзамену по польской культуре (история, география, символы, традиции).",
        lang: "ru",
        theme_color: "#d23b3b",
        background_color: "#16161a",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,json}"],
        // Кэшируем всё приложение для офлайна; данные карточек в бандле.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
