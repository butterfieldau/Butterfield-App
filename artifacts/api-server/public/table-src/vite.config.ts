import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Build output goes into ../table/ so the Express server can serve it
  build: {
    outDir: path.resolve(__dirname, "../table"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Predictable chunk names for caching
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  // Assets are served at /api/table/assets/* by the Express static middleware.
  // Using an absolute base ensures asset URLs work regardless of URL depth.
  base: "/api/table/",
});
