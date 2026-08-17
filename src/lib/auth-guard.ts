import type { SessionUser, UserRole } from "./auth";

export type GuardDecision =
  | { type: "next" }
  | { type: "redirect"; to: string }
  | { type: "json"; status: 401 | 403; error: string };

export function homePathForRole(role: UserRole): string {
  return role === "chief" ? "/admin" : "/inbox";
}

export function roleLabel(role: UserRole): string {
  return role === "chief" ? "Главный менеджер" : "Менеджер";
}

function isPublicPath(pathname: string, method: string): boolean {
  if (pathname === "/login") {
    return true;
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    return true;
  }
  if (pathname === "/api/auth/logout" && method === "POST") {
    return true;
  }
  return false;
}

export function authorizeRequest(
  pathname: string,
  method: string,
  session: SessionUser | null,
): GuardDecision {
  const isApi = pathname.startsWith("/api/");

  if (isPublicPath(pathname, method)) {
    if (pathname === "/login" && session) {
      return { type: "redirect", to: homePathForRole(session.role) };
    }
    return { type: "next" };
  }

  if (pathname === "/") {
    if (!session) {
      return { type: "redirect", to: "/login" };
    }
    return { type: "redirect", to: homePathForRole(session.role) };
  }

  if (!session) {
    if (isApi) {
      return { type: "json", status: 401, error: "Нужно войти" };
    }
    return { type: "redirect", to: "/login" };
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (session.role !== "chief") {
      if (isApi) {
        return { type: "json", status: 403, error: "Только для главного менеджера" };
      }
      return { type: "redirect", to: "/inbox" };
    }
  }

  if (pathname.startsWith("/api/debug/flights") && session.role !== "chief") {
    return { type: "json", status: 403, error: "Только для главного менеджера" };
  }

  return { type: "next" };
}
