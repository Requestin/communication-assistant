import { NextResponse } from "next/server";
import { buildAdminStats } from "@/lib/admin/stats";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "/api/admin/stats");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json(await buildAdminStats(prisma));
}
