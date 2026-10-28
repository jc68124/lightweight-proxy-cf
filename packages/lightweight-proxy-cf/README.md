# @jc68124/lightweight-proxy-cf

Zero-runtime-dependency reverse proxy for Cloudflare Workers Service Bindings.

```ts
import { env } from "cloudflare:workers";
import { createProxy } from "@jc68124/lightweight-proxy-cf";

export default createProxy({
  routes: [{ match: { prefix: "/api" }, service: env.API }],
  fallback: env.WEB,
});
```

## Install

```sh
npm install @jc68124/lightweight-proxy-cf
pnpm add @jc68124/lightweight-proxy-cf
```

Routes support optional exact hostnames, exact/prefix/RegExp path matching, and optional method lists. First match wins. `/api` prefixes match the boundary, not `/apix`. No auth or reserved routes. Requests preserve public URLs and streamed bodies; upstream Responses pass through, including cookies, redirects, SSE, HTML streams, and WebSocket upgrades. Forwarded metadata is replaced from the actual request URL; no client-IP chain is trusted.

See the [repository README](https://github.com/jc68124/lightweight-proxy-cf#readme) for full configuration, forwarding/header/error policies, Wrangler examples, deployment order, tests, and limitations. The package requires the Cloudflare Workers runtime and compatible Workers TypeScript types.
