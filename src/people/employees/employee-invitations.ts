import { createHash, randomBytes } from 'node:crypto';

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

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Employee names are HR-entered text, so they are escaped before entering HTML. */
export function invitationEmail(fullName: string, link: string) {
  const safeName = fullName.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  return {
    subject: 'You have been invited to StackHR',
    text: `Hi ${fullName}, you have been invited to join your team on StackHR. Accept your invitation: ${link} (this link expires in 7 days).`,
    html: `<p>Hi ${safeName},</p><p>You have been invited to join your team on StackHR.</p><p><a href="${link}">Accept your invitation</a></p><p>This link expires in 7 days.</p>`,
  };
}
