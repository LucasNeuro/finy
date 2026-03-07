/**
 * Fetch com timeout e retry para evitar falhas por instabilidade de rede (ECONNRESET, timeout).
 * Usado em createClient/createServerClient.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 25_000;
const SUPABASE_FETCH_RETRIES = 2;
const SUPABASE_FETCH_RETRY_DELAY_MS = 1_500;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    const cause = err.cause as Error | undefined;
    if (msg.includes("abort") || msg.includes("timeout")) return true;
    if (msg.includes("econnreset") || msg.includes("fetch failed")) return true;
    if (cause?.message?.toLowerCase().includes("timeout")) return true;
    if ((cause as { code?: string })?.code === "ECONNRESET") return true;
    if ((cause as { code?: string })?.code === "UND_ERR_CONNECT_TIMEOUT") return true;
  }
  return false;
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryCount = 0
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  const signal = init?.signal ?? controller.signal;

  return fetch(input, {
    ...init,
    signal,
  })
    .then((res) => {
      clearTimeout(id);
      return res;
    })
    .catch((err) => {
      clearTimeout(id);
      if (retryCount < SUPABASE_FETCH_RETRIES && isRetryableError(err)) {
        return new Promise<Response>((resolve, reject) => {
          setTimeout(() => {
            fetchWithTimeout(input, { ...init, signal: undefined }, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, SUPABASE_FETCH_RETRY_DELAY_MS);
        });
      }
      throw err;
    });
}
