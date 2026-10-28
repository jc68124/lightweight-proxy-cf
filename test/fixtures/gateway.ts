import { env } from "cloudflare:workers";
import { createProxy } from "@jc68124/lightweight-proxy-cf";
const bindings = env as unknown as { API: Fetcher; WEB: Fetcher; INGEST: Fetcher };
export default createProxy({ routes: [
  { host: "api.example", match: { prefix: "/" }, service: bindings.API },
  { match: { prefix: "/ingest" }, service: bindings.INGEST },
  { match: { prefix: "/api" }, service: bindings.API },
  { match: { regex: /^\/v[12]\/reports(?:\/|$)/ }, methods: ["GET"], service: bindings.API },
], fallback: bindings.WEB });
