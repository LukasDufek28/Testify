export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function createApiClient(sessionId: string, signal: AbortSignal, onExpired: () => void): ApiFetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) throw new Error("Invalid Testify API address.");
    const headers = new Headers(init?.headers); headers.set("X-Testify-Session", sessionId);
    const response = await fetch(input, { ...init, headers, credentials: "same-origin", signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
    if (response.status === 401) { onExpired(); throw new Error("Please sign in again."); }
    return response;
  };
}
