import { defineConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

export default defineConfig(({ mode }) => ({
  build: {
    target: "es2020",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    minify: mode === "production",
    rollupOptions: {
      input: {
        index: "./index.html",
      },
      output: {
        entryFileNames: "[name].js",
        format: "esm",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
      define: {
        global: "globalThis",
      },
    },
    exclude: [],
  },
  define: {},
  plugins: [wasmPack(["./ironfish_wasm"])],
}));
