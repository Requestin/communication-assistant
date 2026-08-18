import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { buildInboxSnapshot } from "@/lib/inbox";

function parseSince(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "/api/inbox/snapshot");
  if ("response" in auth) {
    return auth.response;
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  const since = parseSince(url.searchParams.get("since"));
  const managerCode = url.searchParams.get("manager");

  const isChief = auth.session.role === "chief";
  let listManagerId: string | undefined = auth.session.id;
  if (isChief) {
    if (managerCode) {
      const manager = await prisma.user.findUnique({
        where: { code: managerCode },
        select: { id: true, role: true },
      });
      if (!manager || manager.role !== "manager") {
        return NextResponse.json({ error: "Менеджер не найден" }, { status: 404 });
      }
      listManagerId = manager.id;
    } else {
      listManagerId = undefined;
    }
  }

  return NextResponse.json(
    await buildInboxSnapshot(prisma, {
      managerId: listManagerId,
      accessManagerId: isChief ? undefined : auth.session.id,
      conversationId,
      since,
      includeManagers: isChief,
    }),
  );
}
