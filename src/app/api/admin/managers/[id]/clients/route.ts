import { NextResponse } from "next/server";
import { listManagerClients } from "@/lib/admin/clients";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireApiSession(request, `/api/admin/managers/${id}/clients`);
  if ("response" in auth) {
    return auth.response;
  }

  const payload = await listManagerClients(prisma, id);
  if (!payload) {
    return NextResponse.json({ error: "Менеджер не найден" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
