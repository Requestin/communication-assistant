import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { parseDebugFlightsQuery } from "@/lib/travel/debug-query";

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "/api/debug/flights");
  if ("response" in auth) {
    return auth.response;
  }

  const parsed = parseDebugFlightsQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  const { from, to, date } = parsed.query;
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const flights = await prisma.flight.findMany({
    where: {
      originCityId: from,
      destCityId: to,
      departAt: { gte: start, lt: end },
    },
    orderBy: { departAt: "asc" },
    select: {
      flightNo: true,
      airline: true,
      departAt: true,
      arriveAt: true,
      priceRub: true,
      seatsLeft: true,
    },
  });

  return NextResponse.json({
    from,
    to,
    date,
    flights: flights.map((flight) => ({
      flightNo: flight.flightNo,
      airline: flight.airline,
      departAt: flight.departAt.toISOString(),
      arriveAt: flight.arriveAt.toISOString(),
      priceRub: flight.priceRub,
      seatsLeft: flight.seatsLeft,
    })),
  });
}
