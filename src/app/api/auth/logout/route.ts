import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth-http";

export async function POST() {
  return clearSession(NextResponse.json({ ok: true }));
}
