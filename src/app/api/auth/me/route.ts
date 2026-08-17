import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest, toPublicUser } from "@/lib/auth";
import { clearSession, jsonError } from "@/lib/auth-http";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return jsonError(401, "Нужно войти");
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) {
    return clearSession(jsonError(401, "Сессия недействительна"));
  }

  return NextResponse.json(toPublicUser(user));
}
