/**
 * Derives a clean 2-5 character uppercase alphanumeric prefix for an organization.
 * Normalizes combining diacritics (e.g. Yoruba/Igbo Ọ̀yọ́ -> OYO, Ọ̀ṣun -> OSUN)
 * and falls back to 'ORG' if the candidate is shorter than 2 characters or unavailable.
 */
export function getOrgPrefix(
  org?: { name?: string | null; slug?: string | null } | null,
): string {
  const isGenericAcmeSlug =
    typeof org?.slug === 'string' &&
    org.slug.startsWith('acme-') &&
    typeof org?.name === 'string' &&
    !org.name.toLowerCase().startsWith('acme');
  const raw = (
    (isGenericAcmeSlug ? org?.name : org?.slug) ||
    org?.name ||
    'ORG'
  )
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  const firstWord = raw.split(/[-_\s]+/)[0];
  const cleaned = firstWord.replace(/[^a-zA-Z0-9]/g, '');
  const candidate = (
    cleaned.length >= 2 ? cleaned : raw.replace(/[^a-zA-Z0-9]/g, '')
  )
    .slice(0, 5)
    .toUpperCase();

  return candidate.length >= 2 ? candidate : 'ORG';
}

/**
 * Calculates the next sequential employee number for an organization in the format:
 * `<TAG>-EMP-<0001>`
 */
export function computeNextEmployeeNumber(
  prefix: string,
  existingEmployees: Array<{ employeeNumber: string | null }>,
): string {
  // prefix interpolation is safe because getOrgPrefix strictly yields [A-Z0-9].
  // Requiring "EMP-" avoids falsely capturing imported bare-numeric HRIS IDs (e.g. "20240157").
  const pattern = new RegExp(`^(?:${prefix}-)?EMP-(\\d+)$`, 'i');
  const numbers = (existingEmployees ?? [])
    .map((e) => {
      const match =
        typeof e?.employeeNumber === 'string'
          ? pattern.exec(e.employeeNumber)
          : null;
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `${prefix}-EMP-${String(nextNum).padStart(4, '0')}`;
}
