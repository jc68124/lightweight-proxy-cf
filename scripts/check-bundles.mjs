import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
for (const worker of ["gateway", "web", "api"]) {
  execFileSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", `examples/web-api/${worker}/wrangler.jsonc`, "--outdir", resolve(`dist/bundles/${worker}`)], { stdio: "inherit" });
}
