import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireApiSession(request, `/api/conversations/${id}/suggest`);
  if ("response" in auth) {
    return auth.response;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, managerId: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Лента не найдена" }, { status: 404 });
  }
  if (conversation.managerId !== auth.session.id && auth.session.role !== "chief") {
    return NextResponse.json({ error: "Нельзя подбирать в чужой ленте" }, { status: 403 });
  }

  const job = await prisma.job.create({
    data: {
      type: "suggest_travel",
      status: "pending",
      conversationId: conversation.id,
      payload: {},
    },
  });

  return NextResponse.json({ jobId: job.id, status: "pending" as const });
}
