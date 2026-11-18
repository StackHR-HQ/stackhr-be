const DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const PROD_DEFAULT_ORIGINS = [
  'https://stackhr-website.onrender.com',
  'https://stackhr-webapp-dev.onrender.com',
  'https://stackhr-admin.onrender.com',
  'https://stackhr.app',
  'https://www.stackhr.app',
  'https://app.stackhr.app',
  'https://admin.stackhr.app',
];

/**
 * Returns the deduplicated list of allowed browser origins for CORS and CSRF
 * origin validation.
 */
export function getAllowedOrigins(): string[] {
  const envOrigins =
    process.env.FRONTEND_URL?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const baseOrigins =
    process.env.NODE_ENV === 'production'
      ? PROD_DEFAULT_ORIGINS
      : [...DEV_ALLOWED_ORIGINS, ...PROD_DEFAULT_ORIGINS];

  return Array.from(new Set([...baseOrigins, ...envOrigins]));
}
