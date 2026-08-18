export const TRAVEL_DISCLAIMER = "учебные данные, не оферта";

export type TravelOfferInsertPackage = {
  label: string;
  outboundLabel: string;
  returnLabel: string | null;
  hotelLabel: string | null;
  totalRub: number;
  why: string;
};

export function formatTravelOfferInsertText(input: {
  summary: string;
  packages: TravelOfferInsertPackage[];
}): string {
  const lines = [input.summary.trim() || "Подбор по заявке.", "", TRAVEL_DISCLAIMER];
  for (const item of input.packages) {
    lines.push(
      "",
      item.label,
      `Туда: ${item.outboundLabel}`,
      item.returnLabel ? `Обратно: ${item.returnLabel}` : "",
      item.hotelLabel ? `Отель: ${item.hotelLabel}` : "",
      `Итого: ${item.totalRub} ₽`,
      item.why,
    );
  }
  return lines.filter((line) => line !== "").join("\n");
}
