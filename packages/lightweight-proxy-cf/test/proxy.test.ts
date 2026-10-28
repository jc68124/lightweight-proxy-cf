import { describe, expect, it } from "vitest";
import { createProxy } from "../src/index.js";
import type { PathMatch, ProxyConfig, Service } from "../src/index.js";

const service = (name: string): Service => ({ fetch: async () => new Response(name) });
const api = service("api");
const web = service("web");
const get = (url: string, method = "GET") => new Request(`https://app.example${url}`, { method });

async function route(match: PathMatch, url: string) {
  return (await createProxy({ routes: [{ match, service: api }], fallback: web }).fetch(get(url))).text();
}

describe("routing", () => {
  it.each([
    ["/api", "api"], ["/api/", "api"], ["/api/users", "api"], ["/apix", "web"],
    ["/API", "web"], ["/api%2Fusers", "web"], ["/api?next=/x", "api"],
  ])("prefix boundary: %s", async (url, expected) => {
    expect(await route({ prefix: "/api" }, url)).toBe(expected);
  });
  it("treats a prefix trailing slash consistently and / as all paths", async () => {
    expect(await route({ prefix: "/api/" }, "/api")).toBe("api");
    expect(await route({ prefix: "/api/" }, "/apix")).toBe("web");
    expect(await route({ prefix: "/" }, "/anything")).toBe("api");
  });
  it("keeps exact trailing slashes distinct", async () => {
    expect(await route({ exact: "/api" }, "/api")).toBe("api");
    expect(await route({ exact: "/api" }, "/api/")).toBe("web");
    expect(await route({ exact: "/api/" }, "/api/")).toBe("api");
    expect(await route({ exact: "/api/" }, "/api")).toBe("web");
  });
  it("matches regex against pathname only, repeatedly", async () => {
    const proxy = createProxy({ routes: [{ match: { regex: /^\/v[12]\/reports\/?$/ }, service: api }], fallback: web });
    for (let i = 0; i < 3; i++) expect(await (await proxy.fetch(get("/v2/reports/?x=1"))).text()).toBe("api");
    expect(await (await proxy.fetch(get("/other?path=/v2/reports"))).text()).toBe("web");
  });
  it("uses first match, including across matching styles", async () => {
    const proxy = createProxy({ routes: [
      { match: { prefix: "/api" }, service: api },
      { match: { exact: "/api/users" }, service: web },
    ] });
    expect(await (await proxy.fetch(get("/api/users"))).text()).toBe("api");
  });
  it("requires both host and method, ignoring host case/port", async () => {
    const proxy = createProxy({ routes: [
      { host: "APP.EXAMPLE", match: { prefix: "/" }, methods: ["get"], service: api },
    ], fallback: web });
    expect(await (await proxy.fetch(new Request("https://app.example:8443/api"))).text()).toBe("api");
    expect(await (await proxy.fetch(new Request("https://other.example/api"))).text()).toBe("web");
    expect(await (await proxy.fetch(get("/api", "POST"))).text()).toBe("web");
    expect(await (await proxy.fetch(get("/api", "HEAD"))).text()).toBe("web");
  });
  it("returns a stable 404 without fallback", async () => {
    const response = await createProxy({ routes: [] }).fetch(get("/auth/login"));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });
  it("matches multiple configured destinations", async () => {
    const proxy = createProxy({ routes: [
      { match: { prefix: "/ingest" }, service: service("ingest") },
      { match: { prefix: "/api" }, service: api },
    ], fallback: web });
    expect(await (await proxy.fetch(get("/ingest/run"))).text()).toBe("ingest");
    expect(await (await proxy.fetch(get("/api/auth/callback/github"))).text()).toBe("api");
    expect(await (await proxy.fetch(get("/"))).text()).toBe("web");
  });
});

describe("validation and failure boundaries", () => {
  it.each([
    { match: { exact: "api" } }, { match: { prefix: "/api?x" } },
    { match: { regex: /api/g } }, { match: { regex: /api/y } },
    { match: { exact: "/", prefix: "/" } }, { match: {} },
    { host: "app.example:8443", match: { prefix: "/" } },
    { host: "app.example/path", match: { prefix: "/" } },
    { methods: [], match: { prefix: "/" } },
    { methods: ["GET POST"], match: { prefix: "/" } },
  ])("rejects invalid configuration %j", rule => {
    expect(() => createProxy({ routes: [{ ...rule, service: api }] } as ProxyConfig)).toThrow(TypeError);
  });
  it("handles unavailable configured bindings without choosing fallback", async () => {
    for (const invalid of [undefined, {}, null]) {
      const proxy = createProxy({ routes: [{ match: { prefix: "/api" }, service: invalid as Service }], fallback: web });
      const response = await proxy.fetch(get("/api"));
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Proxy configuration error");
    }
    const response = await createProxy({ routes: [], fallback: undefined } as unknown as ProxyConfig).fetch(get("/"));
    expect(response.status).toBe(500);
    await response.text();
  });
  it("never retries or falls back on upstream exceptions", async () => {
    let calls = 0;
    const proxy = createProxy({ routes: [{ match: { prefix: "/" }, service: { fetch: async () => {
      calls++; throw new Error("secret diagnostics");
    } } }], fallback: web });
    const response = await proxy.fetch(new Request("https://app.example/", { method: "POST", body: "mutation" }));
    expect(calls).toBe(1);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Bad Gateway");
  });
});
