import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // run `npx wrangler dev` alongside `bun run dev` for the API
    proxy: { "/api": "http://localhost:8787" },
  },
});
