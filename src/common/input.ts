export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
