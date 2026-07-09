/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: "index.html",
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
