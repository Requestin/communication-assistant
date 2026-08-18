export type TrendScale = "reply" | "hour" | "day";

export type ScoreSample = {
  at: Date;
  overall: number;
};

export type TrendPoint = {
  key: string;
  label: string;
  tooltip: string;
  score: number;
};

type MoscowParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOverall(values: number[]): number {
  const sum = values.reduce((total, value) => total + value, 0);
  return roundScore(sum / values.length);
}

function moscowParts(date: Date): MoscowParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function moscowDayKey(parts: MoscowParts): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function moscowHourKey(parts: MoscowParts): string {
  return `${moscowDayKey(parts)}T${parts.hour}`;
}

function dayLabel(parts: MoscowParts): string {
  return `${parts.day}.${parts.month}`;
}

function hourLabel(parts: MoscowParts, includeDay: boolean): string {
  const time = `${parts.hour}:00`;
  return includeDay ? `${dayLabel(parts)} ${time}` : time;
}

function replyLabel(parts: MoscowParts, includeDay: boolean): string {
  const time = `${parts.hour}:${parts.minute}`;
  return includeDay ? `${dayLabel(parts)} ${time}` : time;
}

function tooltip(parts: MoscowParts): string {
  return `${dayLabel(parts)} ${parts.hour}:${parts.minute}`;
}

export function bucketScoreTrend(samples: ScoreSample[], scale: TrendScale): TrendPoint[] {
  if (samples.length === 0) {
    return [];
  }

  const days = new Set(samples.map((sample) => moscowDayKey(moscowParts(sample.at))));
  const includeDay = days.size > 1;

  if (scale === "reply") {
    return samples.map((sample, index) => {
      const parts = moscowParts(sample.at);
      return {
        key: `${sample.at.toISOString()}-${index}`,
        label: replyLabel(parts, includeDay),
        tooltip: tooltip(parts),
        score: sample.overall,
      };
    });
  }

  const groups = new Map<string, { parts: MoscowParts; values: number[] }>();
  for (const sample of samples) {
    const parts = moscowParts(sample.at);
    const key = scale === "hour" ? moscowHourKey(parts) : moscowDayKey(parts);
    const group = groups.get(key) ?? { parts, values: [] };
    group.values.push(sample.overall);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: scale === "hour" ? hourLabel(group.parts, includeDay) : dayLabel(group.parts),
    tooltip:
      scale === "hour" ? `${dayLabel(group.parts)} ${group.parts.hour}:00` : dayLabel(group.parts),
    score: averageOverall(group.values),
  }));
}
