import { createHash, randomBytes } from 'node:crypto';
import { invitationEmail as renderInvitationEmail } from '../../notifications/email-templates';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_FRONTEND_URL = 'https://app.stackhr.app';

/** The raw token is emailed once; only its hash is stored. */
export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** FRONTEND_URL may list several CORS origins; the first is the app itself. */
export function invitationLink(token: string): string {
  const base = (process.env.FRONTEND_URL ?? '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${base || DEFAULT_FRONTEND_URL}/accept-invitation?token=${token}`;
}

export function invitationEmail(fullName: string, link: string) {
  return renderInvitationEmail(fullName, link);
}
