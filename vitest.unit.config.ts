import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2026-10-28" } })],
  test: { include: ["packages/*/test/**/*.test.ts"] },
});
