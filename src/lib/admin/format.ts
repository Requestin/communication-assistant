export function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function formatHintRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}
