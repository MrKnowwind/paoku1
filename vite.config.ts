import { defineConfig } from "vite";
import type { Plugin } from "vite";

function startupAssets(): Plugin {
  return {
    name: "startup-asset-sizes",
    enforce: "post",
    generateBundle(_options, bundle) {
      const main = Object.values(bundle).find(item => item.type === "chunk" && item.facadeModuleId?.replace(/\\/g, "/").endsWith("/src/main.ts"));
      if (!main || main.type !== "chunk") throw new Error("Missing game startup chunk");
      const files = new Set<string>();
      const visit = (file: string) => {
        if (files.has(file)) return;
        files.add(file);
        const item = bundle[file];
        if (item?.type !== "chunk") return;
        item.imports.forEach(visit);
        const metadata = (item as typeof item & {viteMetadata?: {importedCss?: Set<string>}}).viteMetadata;
        metadata?.importedCss?.forEach(css => files.add(css));
      };
      visit(main.fileName);
      const assets = [...files].map(file => {
        const item = bundle[file];
        if (!item) throw new Error(`Missing startup asset: ${file}`);
        const source = item.type === "chunk" ? item.code : item.source;
        return {file, bytes: typeof source === "string" ? new TextEncoder().encode(source).length : source.byteLength};
      });
      this.emitFile({type: "asset", fileName: "startup-assets.json", source: JSON.stringify(assets)});
    },
  };
}

export default defineConfig({
  base: "/paoku1/",
  plugins: [startupAssets()],
  build: {
    target: "es2022",
    rollupOptions: {output: {manualChunks: id => id.includes("node_modules/@babylonjs/") ? "engine" : undefined}},
  },
});
