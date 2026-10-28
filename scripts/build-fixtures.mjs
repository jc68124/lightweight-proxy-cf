import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
for (const worker of ["gateway", "api", "web"]) {
  execFileSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", `test/fixtures/${worker}.jsonc`, "--outdir", resolve(`dist/fixtures/${worker}`)], { stdio: "inherit" });
}
