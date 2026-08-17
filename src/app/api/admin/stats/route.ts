import { NextResponse } from "next/server";
import { buildZeroAdminStats } from "@/lib/admin-stats-stub";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "/api/admin/stats");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json(await buildZeroAdminStats(prisma));
}
