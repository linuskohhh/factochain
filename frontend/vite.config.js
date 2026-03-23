import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // FIXED: Tells Vite to look in the parent directory (project root) for the .env file
  envDir: "../", 
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});