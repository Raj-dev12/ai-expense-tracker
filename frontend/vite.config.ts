import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Anything starting /api is forwarded to the backend, so the browser only
    // ever talks to one address. That avoids CORS entirely in development, and
    // matches production, where Caddy will do the same forwarding.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
