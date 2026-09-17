export interface WorkingDaysInput {
  /** Inclusive, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive, YYYY-MM-DD. */
  endDate: string;
  /** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
  workingWeekdays: number[];
  /** YYYY-MM-DD dates that are not chargeable. */
  holidays: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chargeable leave days in an inclusive date range, evaluated as UTC calendar dates. */
export function countWorkingDays(input: WorkingDaysInput): number {
  const workingWeekdays = new Set(input.workingWeekdays);
  const holidays = new Set(input.holidays);
  const end = Date.parse(`${input.endDate}T00:00:00.000Z`);

  let count = 0;
  for (
    let day = Date.parse(`${input.startDate}T00:00:00.000Z`);
    day <= end;
    day += DAY_MS
  ) {
    const date = new Date(day);
    const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const dateOnly = date.toISOString().slice(0, 10);
    if (workingWeekdays.has(isoWeekday) && !holidays.has(dateOnly)) {
      count += 1;
    }
  }
  return count;
}
