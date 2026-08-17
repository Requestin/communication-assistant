import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ca_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type UserRole = "manager" | "chief";

export type SessionUser = {
  id: string;
  code: string;
  name: string;
  role: UserRole;
};

export type PublicUser = SessionUser & {
  email: string | null;
};

function getSessionSecret(override?: string): Uint8Array {
  const secret = override ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3010";
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: appUrl.startsWith("https://"),
  };
}

export function clearSessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  return { ...sessionCookieOptions(), maxAge: 0 };
}

export async function signSession(
  user: SessionUser,
  options?: { secret?: string; expiresIn?: string | number },
): Promise<string> {
  return new SignJWT({
    role: user.role,
    name: user.name,
    code: user.code,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? `${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret(options?.secret));
}

export async function verifySession(
  token: string,
  secret?: string,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionSecret(secret));
    if (
      !payload.sub ||
      (payload.role !== "manager" && payload.role !== "chief") ||
      typeof payload.name !== "string" ||
      typeof payload.code !== "string"
    ) {
      return null;
    }

    return {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      code: payload.code,
    };
  } catch {
    return null;
  }
}

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }

  return null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) {
    return null;
  }
  return verifySession(token);
}

export function toPublicUser(user: {
  id: string;
  code: string;
  name: string;
  role: UserRole;
  email: string | null;
}): PublicUser {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    email: user.email,
  };
}
