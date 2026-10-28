import example from "../../examples/web-api/api/src/index.js";
export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/throw") throw new Error("private upstream diagnostic");
    if (url.pathname === "/api/status") return new Response("upstream error", { status: 418, statusText: "Teapot", headers: { "X-Upstream": "yes" } });
    if (url.pathname === "/api/redirect-target") return new Response("MUST NOT FOLLOW", { status: 500 });
    if (url.pathname === "/api/redirect-external") return Response.redirect("https://unconfigured.invalid/secret", 307);
    if (url.pathname === "/api/redirect-local") return Response.redirect(new URL("/api/redirect-target", url).href, 302);
    if (url.pathname === "/api/inspect") return Response.json({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: await request.text() });
    if (url.pathname === "/api/stream") {
      const kind = url.searchParams.get("kind");
      return new Response(new ReadableStream({ async start(controller) {
        controller.enqueue(new TextEncoder().encode(kind === "sse" ? "data: first\n\n" : "<html><body>first"));
        await new Promise(resolve => setTimeout(resolve, 250));
        controller.enqueue(new TextEncoder().encode("last"));
        controller.close();
      } }), { headers: { "Content-Type": kind === "sse" ? "text/event-stream" : "text/html" } });
    }
    return example.fetch(request, {}, ctx);
  },
} satisfies ExportedHandler;
