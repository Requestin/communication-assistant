const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

export function isLoopbackHost(host: string): boolean {
  const trimmed = firstHeaderValue(host);
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    const name = (end >= 0 ? trimmed.slice(0, end + 1) : trimmed).toLowerCase();
    return LOOPBACK_HOSTS.has(name);
  }
  return LOOPBACK_HOSTS.has(trimmed.split(":")[0]?.toLowerCase() ?? "");
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Абсолютный origin для редиректов за nginx.
 * Next dev подставляет listen-хост `localhost:3010` в `request.url`,
 * даже если снаружи зашли на assistant.gyhyry.com. См. ARCHITECTURE.md §3.1.
 */
export function publicOriginFromHeaders(
  headers: Headers,
  requestUrl: string,
  appUrl = process.env.APP_URL,
): string {
  const requestOrigin = originOf(requestUrl) ?? "http://127.0.0.1:3010";
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host") ?? headers.get("host"));
  const configured = appUrl ? originOf(appUrl) : null;
  const configuredIsPublic = Boolean(configured && !isLoopbackHost(new URL(configured).host));

  if (forwardedHost && !isLoopbackHost(forwardedHost)) {
    const proto =
      forwardedProto ||
      (configured?.startsWith("https:") ? "https" : new URL(requestOrigin).protocol.replace(":", ""));
    return `${proto}://${forwardedHost}`;
  }

  const proto = forwardedProto || new URL(requestOrigin).protocol.replace(":", "");
  if (proto === "https" && isLoopbackHost(new URL(requestOrigin).host) && configuredIsPublic && configured) {
    return configured;
  }

  return requestOrigin;
}
