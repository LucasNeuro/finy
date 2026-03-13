/**
 * Utilitário para adicionar headers de métricas às respostas das APIs.
 * Permite validar ganho de performance (cache hit vs miss, tempo de resposta).
 */
export function withMetricsHeaders<T extends Response>(
  response: T,
  opts: { cacheHit: boolean; startTime: number; route?: string; payload?: unknown }
): T {
  const ms = Math.round(performance.now() - opts.startTime);
  response.headers.set("X-Response-Time-Ms", String(ms));
  response.headers.set("X-Cache-Hit", opts.cacheHit ? "1" : "0");
  if (opts.route) response.headers.set("X-Route", opts.route);
  if (opts.payload !== undefined) {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(opts.payload));
      response.headers.set("X-Payload-Bytes", String(encoded.byteLength));
    } catch {
      // ignore payload size failures
    }
  }
  return response;
}
