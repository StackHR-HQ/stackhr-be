export function avatarInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// "21 Sep – 23 Sep 2026", or "28 Dec 2026 – 2 Jan 2027" across years (UTC dates).
export function formatDateRange(start: Date, end: Date): string {
  const day = (date: Date) =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = sameYear
    ? day(start)
    : `${day(start)} ${start.getUTCFullYear()}`;
  return `${startLabel} – ${day(end)} ${end.getUTCFullYear()}`;
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  FULLTIME: 'Full-time',
  PARTTIME: 'Part-time',
  CONTRACT: 'Contract',
  CONTRACTOR: 'Contract',
  INTERN: 'Intern',
  INTERNSHIP: 'Intern',
};

// Onboarding stores free text (e.g. FULL_TIME or "Full-time"); normalize it.
export function toEmploymentType(value: string): string {
  const key = value.toUpperCase().replace(/[^A-Z]/g, '');
  return EMPLOYMENT_TYPES[key] ?? value;
}

export function toEmploymentStatus(value: string): string {
  return value.toLowerCase();
}

const PAY_FREQUENCIES: Record<string, string> = {
  MONTHLY: 'Monthly',
  BIWEEKLY: 'Bi-weekly',
  WEEKLY: 'Weekly',
};

export function toPayFrequency(value: string): string {
  return PAY_FREQUENCIES[value] ?? value;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
