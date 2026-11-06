import { defineConfig } from "vite";

export default defineConfig({
  base: "/paoku1/",
  build: {
    target: "es2022",
    rollupOptions: {output: {manualChunks: id => id.includes("node_modules/@babylonjs/") ? "engine" : undefined}},
  },
});
