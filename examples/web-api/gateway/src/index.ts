import { env } from "cloudflare:workers";
import { createProxy } from "@jc68124/lightweight-proxy-cf";

declare global {
  namespace Cloudflare {
    interface Env { WEB: Fetcher; API: Fetcher }
  }
}

export default createProxy({
  routes: [{ match: { prefix: "/api" }, service: env.API }],
  fallback: env.WEB,
});
