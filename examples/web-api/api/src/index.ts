export default {
  async fetch(request, _env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/api/socket" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.binaryType = "arraybuffer";
      server.accept();
      server.addEventListener("message", event => server.send(event.data));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === "/api/redirect") return Response.redirect(new URL("/", request.url).href, 302);
    if (path === "/api/cookies") {
      const headers = new Headers();
      headers.append("Set-Cookie", "first=1; Path=/; HttpOnly; SameSite=Lax; Expires=Tue, 01 Jan 2030 00:00:00 GMT");
      headers.append("Set-Cookie", "second=2; Path=/; HttpOnly; SameSite=Lax");
      return new Response("Cookies set", { headers });
    }
    if (path === "/api/events") {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: hello\n\n'));
          controller.close();
        },
      }), { headers: { "Content-Type": "text/event-stream" } });
    }
    if (path === "/api/echo") {
      if (!request.body) return new Response(null);
      const { readable, writable } = new TransformStream<Uint8Array>();
      ctx.waitUntil(request.body.pipeTo(writable));
      return new Response(readable, { headers: { "Content-Type": "application/octet-stream" } });
    }
    return Response.json({ service: "api", url: request.url, method: request.method });
  },
} satisfies ExportedHandler;
