import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth-http";

export async function POST(request: Request) {
  return clearSession(NextResponse.json({ ok: true }), request);
}
