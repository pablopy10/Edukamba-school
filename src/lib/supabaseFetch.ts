/**
 * Fetch para o cliente Supabase (Auth + REST) com retentativas curtas —
 * redes móveis / Wi‑Fi instáveis falham ocasionalmente com `TypeError: Failed to fetch`.
 */
export function createSupabaseFetch(retries = 3): typeof fetch {
  const nativeFetch: typeof fetch = (...args: Parameters<typeof fetch>) =>
    typeof globalThis.fetch === "function"
      ? globalThis.fetch(...args)
      : Promise.reject(new Error("fetch não está disponível neste ambiente"));

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await nativeFetch(input, init);
      } catch (e) {
        last = e;
        if (attempt === retries) break;
        await new Promise((r) => setTimeout(r, 380 * 2 ** attempt));
      }
    }
    throw last;
  };
}
