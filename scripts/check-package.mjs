import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "proxy-consumer-"));
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
    cwd: resolve("packages/lightweight-proxy-cf"), encoding: "utf8",
  }))[0];
  const files = new Set(packed.files.map(file => file.path));
  for (const required of ["dist/index.js", "dist/index.d.ts", "README.md"]) {
    if (!files.has(required)) throw new Error(`Missing package file: ${required}`);
  }
  const metadata = JSON.parse(readFileSync("packages/lightweight-proxy-cf/package.json", "utf8"));
  if (Object.keys(metadata.dependencies ?? {}).length) throw new Error("Unexpected runtime dependencies");
  writeFileSync(join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", join(temp, packed.filename)], { cwd: temp, stdio: "inherit" });
  writeFileSync(join(temp, "index.ts"), `import { createProxy } from "@jc68124/lightweight-proxy-cf";
interface Env { API: Fetcher; WEB: Fetcher }
export default {
  fetch(request, env) {
    return createProxy({ routes: [{ match: { prefix: "/api" }, service: env.API }], fallback: env.WEB }).fetch(request);
  }
} satisfies ExportedHandler<Env>;
`);
  writeFileSync(join(temp, "tsconfig.json"), JSON.stringify({
    extends: resolve("tsconfig.base.json"), compilerOptions: { types: [] },
    files: ["index.ts", resolve("node_modules/@cloudflare/workers-types/index.d.ts")],
  }));
  execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "--noEmit", "-p", join(temp, "tsconfig.json")], { stdio: "inherit" });
  writeFileSync(join(temp, "wrangler.jsonc"), JSON.stringify({ name: "proxy-package-consumer-check", main: "index.ts", compatibility_date: "2026-10-28" }));
  execFileSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "-c", join(temp, "wrangler.jsonc"), "--outdir", join(temp, "bundle")], { cwd: root, stdio: "inherit" });
  console.log(`Verified packed ${metadata.name}: ${packed.size} bytes; ESM/types and isolated consumer bundle passed.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
