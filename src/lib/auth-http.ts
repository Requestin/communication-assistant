import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  getSessionFromRequest,
  type SessionUser,
} from "./auth";
import { authorizeRequest } from "./auth-guard";
import { publicOriginFromHeaders } from "./public-origin";

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function applyGuard(
  pathname: string,
  method: string,
  session: SessionUser | null,
  origin = process.env.APP_URL ?? "http://127.0.0.1:3010",
): NextResponse | null {
  const decision = authorizeRequest(pathname, method, session);
  if (decision.type === "next") {
    return null;
  }
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, origin));
  }
  return jsonError(decision.status, decision.error);
}

export async function requireApiSession(
  request: Request,
  pathname: string,
): Promise<{ session: SessionUser } | { response: NextResponse }> {
  const session = await getSessionFromRequest(request);
  const origin = publicOriginFromHeaders(request.headers, request.url);
  const blocked = applyGuard(pathname, request.method, session, origin);
  if (blocked) {
    return { response: blocked };
  }
  if (!session) {
    return { response: jsonError(401, "Нужно войти") };
  }
  return { session };
}

export function clearSession(response: NextResponse, request?: Request): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions(request));
  return response;
}
