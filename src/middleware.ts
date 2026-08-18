import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { authorizeRequest } from "@/lib/auth-guard";
import { publicOriginFromHeaders } from "@/lib/public-origin";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifySession(token) : null;
  const decision = authorizeRequest(request.nextUrl.pathname, request.method, session);

  if (decision.type === "redirect") {
    const origin = publicOriginFromHeaders(request.headers, request.url);
    return NextResponse.redirect(new URL(decision.to, origin));
  }

  if (decision.type === "json") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
