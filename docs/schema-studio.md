# Schema Studio consumer

Proposed integration for `jc68124/schema-studio`; the repository was empty when inspected. This is copyable configuration, not an applied change or verified application deployment.

Keep Next.js/OpenNext configuration in `apps/web`, Hono/Better Auth/D1 in `apps/api`, and the public entry point in `apps/gateway`.

`apps/gateway/src/index.ts`:

```ts
import { env } from "cloudflare:workers";
import { createProxy } from "@jc68124/lightweight-proxy-cf";

export default createProxy({
  routes: [{ match: { prefix: "/api" }, service: env.API }],
  fallback: env.WEB,
});
```

`apps/gateway/wrangler.jsonc`:

```jsonc
{
  "name": "schema-studio-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-28",
  "services": [
    { "binding": "API", "service": "schema-studio-api" },
    { "binding": "WEB", "service": "schema-studio-web" }
  ]
}
```

Install the published package in the gateway workspace, then run `wrangler types` there. Attach the application's chosen public domain only to the gateway. Deploy web and API before gateway. Disable downstream public ingress as described in the root README.

The API must mount routes under `/api`; `/api/auth/*` reaches Better Auth unchanged. Configure Better Auth's public base URL, trusted origins, and GitHub callback URL in the API/provider configuration. D1, credentials, OAuth, sessions, and authorization belong entirely to the API. Use browser-relative `/api/...` requests for same-origin cookies. The gateway does not rewrite cookies or redirect Locations.

`/_next/*`, assets, pages, server actions, streamed HTML, and any other non-API paths go to the web Worker with their original public URL. Keep OpenNext assets/bindings and framework deployment commands in the web application. Applications may also use their own direct server-to-server bindings without traversing the public gateway.
