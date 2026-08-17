import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  toPublicUser,
} from "@/lib/auth";
import { jsonError } from "@/lib/auth-http";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Нужен JSON с полем userId");
  }

  const userId =
    typeof body === "object" && body !== null && "userId" in body
      ? String((body as { userId: unknown }).userId).trim()
      : "";

  if (!userId) {
    return jsonError(400, "Нужен userId");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return jsonError(404, "Пользователь не найден");
  }

  const token = await signSession({
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
  });

  const response = NextResponse.json(toPublicUser(user));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
