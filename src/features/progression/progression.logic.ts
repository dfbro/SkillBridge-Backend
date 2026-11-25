export type StreakSummary = { current: number; longest: number };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function getActivityDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function previousDate(date: string): string {
  const instant = new Date(`${date}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}

export function nextDate(date: string): string {
  const instant = new Date(`${date}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

export function calculateStreak(activityDates: string[], today: string, graceDays = 1): StreakSummary {
  const dates = [...new Set(activityDates)].sort();
  let longest = 0;
  let run = 0;
  let previous: string | undefined;

  for (const date of dates) {
    run = previous && nextDate(previous) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const startDate = dates.includes(today) ? today : graceDays > 0 ? previousDate(today) : today;
  if (!dates.includes(startDate)) return { current: 0, longest };

  let current = 1;
  let cursor = startDate;
  while (dates.includes(previousDate(cursor))) {
    cursor = previousDate(cursor);
    current += 1;
  }
  return { current, longest };
}

export function calculateLevel(totalXp: number, thresholds: number[]): number {
  return thresholds.reduce((level, threshold, index) => totalXp >= threshold ? index + 1 : level, 1);
}

export function getRecentDates(today: string, days: number): string[] {
  const dates: string[] = [];
  let cursor = today;
  for (let index = 0; index < days; index += 1) {
    dates.push(cursor);
    cursor = previousDate(cursor);
  }
  return dates.reverse();
}
