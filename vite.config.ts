import { defineConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => ({
  build: {
    target: "es2020",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    minify: false,
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
  plugins: [
    nodePolyfills({
      exclude: [],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
    wasmPack(["./ironfish_wasm"]),
  ],
}));
