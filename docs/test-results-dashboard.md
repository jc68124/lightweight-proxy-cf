# Test Results Dashboard consumer

Based on the inspected gateway at `jc68124/test-results-dashboard`, commit `e0cd97b2e505e0504226888414b97f30a8e900b4`. This example does not modify that repository.

```ts
import { env } from "cloudflare:workers";
import { createProxy } from "@jc68124/lightweight-proxy-cf";

export default createProxy({
  routes: [
    { match: { prefix: "/ingest" }, service: env.API_INGEST },
    { match: { prefix: "/api" }, service: env.API_DASHBOARD },
  ],
  fallback: env.WEB,
});
```

Keep its existing gateway Service Binding configuration for API_INGEST, API_DASHBOARD, and WEB. The downstream APIs already mount at `/ingest` and `/api`, so no prefix stripping is required. No auth configuration, JWT/HMAC secret declarations, placeholder storage objects, or SessionDO export is needed by this proxy.

Its Next.js server-side API fetcher binds directly to the dashboard API. That path remains an application concern and need not traverse the gateway. Browser-relative API requests use the public gateway.

Migration changes the forwarded URL from `http://internal` to the actual public URL. Audit any downstream code that relied on the internal hostname or gateway-specific user headers. Preserve all application authentication/authorization and ingestion-key validation downstream.
