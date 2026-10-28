import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const server = new Miniflare({ workers: ["gateway", "api", "web"].map(name => ({
  config: {
    name,
    compatibilityDate: "2026-10-28",
    manifest: { mainModule: "index.js", modules: {
      "index.js": { type: "esm" as const, contents: readFileSync(`dist/fixtures/${name}/${name === "web" ? "index" : name}.js`, "utf8") },
    } },
    ...(name === "gateway" ? { env: {
      API: { type: "worker" as const, worker: "api" },
      WEB: { type: "worker" as const, worker: "web" },
      INGEST: { type: "worker" as const, worker: "api" },
    } } : {}),
  },
})) });
beforeAll(() => server.ready);
afterAll(() => server.dispose());

describe("actual Service Binding forwarding", () => {
  it("preserves URL, query, method, bytes, and application/auth headers while replacing spoofed forwarding headers", async () => {
    const response = await server.dispatchFetch("https://public.example:8443/api/inspect?x=1&x=2&encoded=%2F", {
      method: "POST", body: "body=hello&utf8=£", headers: {
        "Content-Type": "application/custom", "Cookie": "session=abc; other=2", Authorization: "Bearer token",
        "X-App": "value", Origin: "https://public.example", Host: "spoofed.example",
        Forwarded: "host=evil", "X-Forwarded-Host": "evil", "X-Forwarded-Proto": "ftp",
        "X-Forwarded-For": "spoofed", "X-Forwarded-Port": "1", "X-Forwarded-Prefix": "/evil", "X-Original-URL": "evil",
      },
    });
    const result = await response.json() as { url: string; method: string; body: string; headers: Record<string, string> };
    expect(result.url).toBe("https://public.example:8443/api/inspect?x=1&x=2&encoded=%2F");
    expect(result.method).toBe("POST");
    expect(result.body).toBe("body=hello&utf8=£");
    expect(result.headers).toMatchObject({ cookie: "session=abc; other=2", authorization: "Bearer token", "x-app": "value",
      "content-type": "application/custom", origin: "https://public.example", host: "public.example:8443",
      "x-forwarded-host": "public.example:8443", "x-forwarded-proto": "https", "x-forwarded-port": "8443", "x-original-url": result.url });
    for (const key of ["forwarded", "x-forwarded-for", "x-forwarded-prefix"]) expect(result.headers[key]).toBeUndefined();
  });
  it("preserves separate cookies, including Expires commas", async () => {
    const response = await server.dispatchFetch("https://public.example/api/cookies");
    expect(response.headers.getSetCookie()).toEqual([
      "first=1; Path=/; HttpOnly; SameSite=Lax; Expires=Tue, 01 Jan 2030 00:00:00 GMT", "second=2; Path=/; HttpOnly; SameSite=Lax",
    ]);
    await response.text();
  });
  it.each(["local", "external"])("does not follow %s redirects", async destination => {
    const response = await server.dispatchFetch(`https://public.example/api/redirect-${destination}`, { redirect: "manual" });
    expect(response.status).toBe(destination === "local" ? 302 : 307);
    expect(response.headers.get("Location")).toBe(destination === "local" ? "https://public.example/api/redirect-target" : "https://unconfigured.invalid/secret");
    await response.text();
  });
  it("passes through upstream status and headers", async () => {
    const response = await server.dispatchFetch("https://public.example/api/status");
    expect(response.status).toBe(418);
    expect(response.statusText).toBe("Teapot");
    expect(response.headers.get("X-Upstream")).toBe("yes");
    expect(await response.text()).toBe("upstream error");
  });
  it("sanitizes a rejected Service Binding request", async () => {
    const response = await server.dispatchFetch("https://public.example/api/throw");
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Bad Gateway");
  });
  it("supports host routing, multiple prefixes, regex, and fallback across Workers", async () => {
    for (const url of ["https://api.example/", "https://public.example/ingest", "https://public.example/v2/reports/"]) {
      const response = await server.dispatchFetch(url);
      expect(await response.json()).toMatchObject({ service: "api", url });
    }
    const response = await server.dispatchFetch("https://public.example/apix");
    expect(await response.text()).toContain("Web Worker");
  });
  it.each(["sse", "html"])("streams %s before completion", async kind => {
    const id = crypto.randomUUID();
    const response = await server.dispatchFetch(`https://public.example/api/stream?id=${id}&kind=${kind}`, { headers: { "Accept-Encoding": "identity" } });
    const reader = response.body!.getReader();
    try {
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(new TextDecoder().decode(first.value)).toBe(kind === "sse" ? "data: first\n\n" : "<html><body>first");
      let rest = "";
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value); }
      expect(rest).toBe("last");
    } finally { await reader.cancel(); }
  });
  it("streams an upload through the binding before the client finishes sending", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    controller.enqueue(new TextEncoder().encode("first"));
    const response = await server.dispatchFetch("https://public.example/api/echo", { method: "POST", body, duplex: "half" });
    const reader = response.body!.getReader();
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
      controller.enqueue(new TextEncoder().encode("last"));
      controller.close();
      let rest = "";
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value); }
      expect(rest).toBe("last");
    } finally { await reader.cancel(); }
  });
  it("passes through a WebSocket upgrade and text/binary frames", async () => {
    const response = await server.dispatchFetch("https://public.example/api/socket", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    expect(socket).toBeTruthy();
    socket.accept();
    const text = new Promise(resolve => socket.addEventListener("message", event => resolve(event.data), { once: true }));
    socket.send("hello");
    expect(await text).toBe("hello");
    const binary = new Promise(resolve => socket.addEventListener("message", event => resolve(event.data), { once: true }));
    socket.send(new Uint8Array([0, 1, 255]).buffer);
    const data = await binary;
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data as ArrayBuffer);
    expect(bytes).toEqual(new Uint8Array([0, 1, 255]));
    const closed = new Promise(resolve => socket.addEventListener("close", event => resolve(event.code), { once: true }));
    socket.close(1000, "done");
    expect(await closed).toBe(1000);
  });
});
