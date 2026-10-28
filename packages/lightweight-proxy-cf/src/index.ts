/** Only fetch is needed; Cloudflare Service Bindings satisfy this contract. */
export type Service = Pick<Fetcher, "fetch">;

export type PathMatch =
  | { exact: string; prefix?: never; regex?: never }
  | { prefix: string; exact?: never; regex?: never }
  | { regex: RegExp; exact?: never; prefix?: never };

export interface Route {
  readonly host?: string;
  readonly match: PathMatch;
  readonly methods?: readonly string[];
  readonly service: Service;
}

export interface ProxyConfig {
  readonly routes: readonly Route[];
  readonly fallback?: Service;
}

function hostname(host: string): string {
  const parsed = new URL(`https://${host}`);
  if (parsed.host !== host.toLowerCase() || parsed.port || parsed.username ||
      parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("Proxy host must be a hostname without a port or URL components");
  }
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

function path(value: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[?#]/.test(value)) {
    throw new TypeError("Proxy path must start with / and contain no query or fragment");
  }
  return value;
}

function compile(route: Route) {
  const host = route.host === undefined ? undefined : hostname(route.host);
  if (route.methods !== undefined && (!Array.isArray(route.methods) || !route.methods.length ||
      route.methods.some(method => typeof method !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)))) {
    throw new TypeError("Proxy methods must be a nonempty array of HTTP method tokens");
  }
  const methods = route.methods?.map(method => method.toUpperCase());
  const match = route.match;
  if (!match || Object.keys(match).length !== 1) {
    throw new TypeError("Proxy match requires exactly one of exact, prefix, or regex");
  }
  let matchesPath: (pathname: string) => boolean;
  if ("exact" in match && match.exact !== undefined) {
    const exact = path(match.exact);
    matchesPath = pathname => pathname === exact;
  } else if ("prefix" in match && match.prefix !== undefined) {
    const prefix = path(match.prefix).replace(/\/+$/, "") || "/";
    matchesPath = pathname => prefix === "/" || pathname === prefix || pathname.startsWith(`${prefix}/`);
  } else if ("regex" in match && match.regex instanceof RegExp && !/[gy]/.test(match.regex.flags)) {
    const regex = new RegExp(match.regex.source, match.regex.flags);
    matchesPath = pathname => regex.test(pathname);
  } else {
    throw new TypeError("Proxy match requires a valid path or RegExp without g/y flags");
  }
  return {
    service: route.service,
    matches: (url: URL, method: string) =>
      (host === undefined || url.hostname.toLowerCase().replace(/\.$/, "") === host) &&
      (methods === undefined || methods.includes(method.toUpperCase())) && matchesPath(url.pathname),
  };
}

function error(status: number, message: string): Response {
  return new Response(message, { status, headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  } });
}

/** Configure once at module scope. No network calls or authentication initialization. */
export function createProxy(config: ProxyConfig): { fetch(request: Request): Promise<Response> } {
  const routes = config.routes.map(compile);
  const hasFallback = Object.prototype.hasOwnProperty.call(config, "fallback");
  const fallback = config.fallback;

  return {
    async fetch(request) {
      const url = new URL(request.url);
      const route = routes.find(candidate => candidate.matches(url, request.method));
      if (!route && !hasFallback) return error(404, "Not Found");
      const service = route ? route.service : fallback;
      if (!service || typeof service.fetch !== "function") {
        return error(500, "Proxy configuration error");
      }

      const headers = new Headers(request.headers);
      for (const name of [...headers.keys()]) {
        if (name === "forwarded" || name.startsWith("x-forwarded-") || name === "x-original-url") {
          headers.delete(name);
        }
      }
      headers.set("Host", url.host);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
      headers.set("X-Forwarded-Port", url.port || (url.protocol === "https:" ? "443" : "80"));
      headers.set("X-Original-URL", request.url);

      try {
        const upstreamRequest = new Request(request, { headers, redirect: "manual" });
        // Return the original Response: streams, cookies, and WebSocket upgrades stay intact.
        return await service.fetch(upstreamRequest);
      } catch {
        return error(502, "Bad Gateway");
      }
    },
  };
}
