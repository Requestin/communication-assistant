import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InboxNoteDto } from "@/lib/inbox";
import { formatTravelOfferInsertText } from "@/lib/travel/offer-text";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

type OfferPackage = {
  label: string;
  outboundLabel: string;
  returnLabel: string | null;
  hotelLabel: string | null;
  totalRub: number;
  why: string;
  people: number | null;
  outboundSeatRub: number | null;
  returnSeatRub: number | null;
  hotelCostRub: number | null;
};

function asFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPackages(value: unknown): OfferPackage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const row = item as Record<string, unknown>;
    const totalRub = asFinite(row.totalRub);
    if (totalRub === null) {
      return [];
    }
    return [
      {
        label: asString(row.label) || "Вариант",
        outboundLabel: asString(row.outboundLabel),
        returnLabel: asString(row.returnLabel) || null,
        hotelLabel: asString(row.hotelLabel) || null,
        totalRub,
        why: asString(row.why),
        people: asFinite(row.people),
        outboundSeatRub: asFinite(row.outboundSeatRub),
        returnSeatRub: asFinite(row.returnSeatRub),
        hotelCostRub: asFinite(row.hotelCostRub),
      },
    ];
  });
}

function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function packageBreakdown(item: OfferPackage): string | null {
  if (item.outboundSeatRub === null) {
    return null;
  }
  const people = Math.max(1, item.people ?? 1);
  const outbound = item.outboundSeatRub * people;
  const inbound = (item.returnSeatRub ?? 0) * people;
  const hotel = item.hotelCostRub ?? 0;
  const parts = [formatRub(outbound)];
  if (item.returnSeatRub !== null) {
    parts.push(formatRub(inbound));
  }
  if (hotel > 0) {
    parts.push(formatRub(hotel));
  }
  return `${parts.join(" + ")} = ${formatRub(item.totalRub)}`;
}

export function TravelOfferCard({
  note,
  canInsert,
  onInsert,
}: {
  note: InboxNoteDto;
  canInsert: boolean;
  onInsert: (text: string) => void;
}) {
  const summary = asString(note.payload.summary) || note.body;
  const packages = asPackages(note.payload.packages);
  const warnings = asWarnings(note.payload.warnings);
  const insertText = formatTravelOfferInsertText({ summary, packages });

  return (
    <article className="w-full rounded-xl border border-primary/45 bg-primary/12 px-4 py-3 shadow-[inset_0_1px_0_oklch(0.78_0.12_75_/_0.12)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm">{note.title}</h3>
        <span className="rounded-full border border-primary/50 bg-background/40 px-2 py-0.5 text-[11px] tracking-wide text-primary">
          Только для сотрудников
        </span>
      </div>
      {summary ? <p className="whitespace-pre-wrap text-sm">{summary}</p> : null}
      {packages.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-primary/25 bg-background/25">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground">Вариант</TableHead>
                <TableHead className="text-muted-foreground">Туда</TableHead>
                <TableHead className="text-muted-foreground">Обратно</TableHead>
                <TableHead className="text-muted-foreground">Отель</TableHead>
                <TableHead className="text-right text-muted-foreground">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((item) => (
                <TableRow key={`${item.label}-${item.outboundLabel}`} className="hover:bg-primary/5">
                  <TableCell className="whitespace-normal font-medium">{item.label}</TableCell>
                  <TableCell className="whitespace-normal text-sm">{item.outboundLabel || "—"}</TableCell>
                  <TableCell className="whitespace-normal text-sm">{item.returnLabel ?? "—"}</TableCell>
                  <TableCell className="whitespace-normal text-sm">{item.hotelLabel ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    <div>{formatRub(item.totalRub)}</div>
                    {packageBreakdown(item) ? (
                      <div className="mt-1 text-[11px] font-normal text-muted-foreground">{packageBreakdown(item)}</div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {packages.some((item) => (item.people ?? 0) > 1) ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Цена рейса — за один билет, в сумме умножается на число человек. Отель — за проживание на все ночи.
        </p>
      ) : null}
      {packages.some((item) => item.why) ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {packages
            .filter((item) => item.why)
            .map((item) => (
              <li key={`${item.label}-why`}>
                {item.label}: {item.why}
              </li>
            ))}
        </ul>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {canInsert && packages.length > 0 ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInsert(insertText)}
          >
            Вставить в ответ
          </Button>
        </div>
      ) : null}
    </article>
  );
}
