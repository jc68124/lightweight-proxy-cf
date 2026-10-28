export default {
  fetch() {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<!doctype html><title>Proxy example</title><h1>Web Worker</h1>'));
        controller.enqueue(new TextEncoder().encode('<p><a href="/api">API</a> · <a href="/api/events">SSE</a></p>'));
        controller.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
} satisfies ExportedHandler;
