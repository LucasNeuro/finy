const UAZAPI_FETCH_TIMEOUT_MS = Number(process.env.UAZAPI_FETCH_TIMEOUT_MS) || 25_000;

function getUazapiBaseUrl(): string {
  const url = process.env.UAZAPI_BASE_URL;
  if (!url?.trim()) return "https://free.uazapi.com";
  return url.replace(/\/$/, "");
}

export async function callUazSender<T = unknown>(
  token: string,
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown }
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const base = getUazapiBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UAZAPI_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        token,
      },
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: isAbort ? "Timeout ao conectar na UAZAPI." : "Falha de rede ao chamar UAZAPI.",
    };
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  let data: T | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      // ignore non-json response
    }
  }

  if (!res.ok) {
    const err =
      (data && typeof data === "object" && "error" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error ?? "")
        : "") || text || res.statusText;
    return { ok: false, status: res.status, error: err || `HTTP ${res.status}`, data };
  }

  return { ok: true, status: res.status, data };
}
