# Verification record

Verified locally on 28 October 2026 using Node 24.22.1, pnpm 11.7.0, Wrangler 4.154.0, Vitest 5.0.5, and the pinned workerd runtime.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm build` | ESM JavaScript and declarations generated |
| `pnpm typecheck` | Passed with strict TypeScript |
| `pnpm test` | 26 workerd unit cases and 11 cross-Worker integration cases passed |
| `pnpm check:bundle` | Wrangler dry runs for gateway, web, and API passed |
| `pnpm check:package` | Packed package had zero runtime dependencies; isolated consumer installation, declaration check, and Wrangler bundle passed |
| `pnpm exec changeset status` | Initial minor release identified |
| Changesets version command in disposable copy | Generated version 0.1.0 and package changelog; repository version left at 0.0.0 |
| Multi-config `pnpm dev` HTTP smoke check | Web/API routing, POST echo, two Set-Cookie headers, and redirect passed |
| Workflow YAML and Git whitespace check | Parsed successfully; no whitespace errors |

## Runtime testing decisions

Integration tests use Wrangler-generated bundles with direct Miniflare Service Bindings. An initial attempt with Wrangler's `createTestHarness()` exposed differences from production binding behaviour: the local development proxy translated upstream exceptions into diagnostic HTTP responses and changed the HTTPS scheme at public ingress. Using direct workerd bindings establishes the package's forwarding behaviour without that proxy layer.

SSE and HTML tests assert that the first chunk is received before the upstream finishes. They explicitly request `Accept-Encoding: identity` to keep transport compression from coalescing chunks. The package does not modify compression headers or perform its own body transformations. Streamed upload testing keeps the client stream open until the first echoed bytes arrive. WebSocket testing exercises a real 101 response, text and binary echoes, and close code propagation.

The separate live Wrangler development smoke check caught an example issue: returning the incoming request stream directly allowed Wrangler's drain-body middleware to consume it. The example now starts a `pipeTo()` immediately and registers it with `waitUntil()`. This fix is confined to the example; the proxy still returns upstream Responses intact.

Explicit development/inspector ports avoid this execution environment's restricted network-interface enumeration. Local Request.cf metadata retrieval timed out and Wrangler used placeholder data; the package does not use that metadata for its trusted forwarding headers.

## Not established by these checks

No Worker was deployed to a Cloudflare account, no domain/DNS/TLS configuration was changed, and no package was published to npm. GitHub Actions must also run on the review branch; local checks do not substitute for observing that result. The npm trusted-publisher relationship and repository release settings require account-side configuration.

Private downstream ingress is documented and configured in the examples, but has not been tested against deployed Workers. The application guides are configurations, not migrations of Schema Studio or Test Results Dashboard. Actual Next.js/OpenNext rendering, Better Auth, and GitHub OAuth callbacks require verification in the consuming application. None of those existing repositories was modified.
