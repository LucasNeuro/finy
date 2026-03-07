/**
 * Utilitário para adicionar headers de métricas às respostas das APIs.
 * Permite validar ganho de performance (cache hit vs miss, tempo de resposta).
 */
export function withMetricsHeaders<T extends Response>(
  response: T,
  opts: { cacheHit: boolean; startTime: number }
): T {
  const ms = Math.round(performance.now() - opts.startTime);
  response.headers.set("X-Response-Time-Ms", String(ms));
  response.headers.set("X-Cache-Hit", opts.cacheHit ? "1" : "0");
  return response;
}
