const DEFAULT_APP_URL = 'https://app.stackhr.app';
const DEFAULT_SUPPORT_EMAIL = 'support@stackhr.app';

export interface TransactionalEmail {
  subject: string;
  text: string;
  html: string;
}

const COLORS = {
  ink: '#172126',
  muted: '#59636a',
  line: '#d9e0e3',
  paper: '#ffffff',
  canvas: '#f4f7f8',
  teal: '#1f6678',
  tealBright: '#11b7d8',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function appUrl(): string {
  return (
    process.env.STACKHR_APP_URL ??
    process.env.FRONTEND_URL?.split(',')[0]?.trim() ??
    DEFAULT_APP_URL
  ).replace(/\/+$/, '');
}

function supportEmail(): string {
  return process.env.STACKHR_SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;
}

function layout(input: {
  eyebrow: string;
  title: string;
  body: string;
  content: string;
}): string {
  const support = escapeHtml(supportEmail());
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;background:${COLORS.canvas};color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.body)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.canvas};">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:${COLORS.paper};">
          <tr><td style="padding:0;background:${COLORS.teal};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:27px 32px;color:#fff;font-size:24px;font-weight:700;letter-spacing:5px;">STACKHR</td>
                <td align="right" style="padding:27px 32px;color:#b6d3da;font-size:10px;letter-spacing:3px;">PEOPLE OPERATIONS</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:54px 48px 48px;">
            <p style="margin:0 0 28px;color:${COLORS.teal};font-size:12px;letter-spacing:4px;">${escapeHtml(input.eyebrow)}</p>
            <h1 style="margin:0 0 22px;color:${COLORS.ink};font-size:42px;line-height:1.08;letter-spacing:-1px;font-weight:700;">${escapeHtml(input.title)}</h1>
            <p style="margin:0 0 32px;color:${COLORS.muted};font-size:17px;line-height:1.65;">${escapeHtml(input.body)}</p>
            ${input.content}
          </td></tr>
          <tr><td style="border-top:1px solid ${COLORS.line};padding:24px 48px 30px;color:#7b858a;font-size:12px;line-height:1.7;">
            Questions or something not working? Reply to this email or contact <a href="mailto:${support}" style="color:${COLORS.teal};">${support}</a>.
            <br><br>You’re receiving this because you have a StackHR account or invitation. Keep this email private.
          </td></tr>
          <tr><td style="background:#edf1f2;padding:24px 48px;color:#7b858a;font-size:11px;line-height:1.7;">
            <strong style="color:${COLORS.ink};font-size:14px;letter-spacing:3px;">STACKHR</strong><br>
            People operations, made clear.<br>
            © ${new Date().getUTCFullYear()} StackHR · <a href="${escapeHtml(appUrl())}" style="color:${COLORS.teal};">Open StackHR</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function verificationEmail(code: string): TransactionalEmail {
  const safeCode = escapeHtml(code);
  const link = escapeHtml(appUrl());
  return {
    subject: 'Your StackHR verification code',
    text: `Your StackHR verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
    html: layout({
      eyebrow: 'SECURITY / EMAIL VERIFICATION',
      title: 'Confirm your email.',
      body: 'Use the verification code below to finish setting up your StackHR account.',
      content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;background:#edf6f8;border:1px solid #c9e1e6;"><tr><td align="center" style="padding:25px 16px 22px;"><p style="margin:0 0 9px;color:${COLORS.teal};font-size:11px;letter-spacing:3px;">YOUR ONE-TIME CODE</p><p style="margin:0;color:${COLORS.ink};font-size:36px;line-height:1.2;font-weight:700;letter-spacing:9px;">${safeCode}</p></td></tr></table><p style="margin:0 0 28px;color:${COLORS.muted};font-size:13px;line-height:1.6;">This code expires in <strong>10 minutes</strong> and can be used once. If you did not request this code, you can safely ignore this email.</p><a href="${link}" style="display:inline-block;background:${COLORS.tealBright};color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;padding:17px 24px;">OPEN STACKHR&nbsp; →</a>`,
    }),
  };
}

export function invitationEmail(
  fullName: string,
  invitationUrl: string,
): TransactionalEmail {
  const link = escapeHtml(invitationUrl);
  return {
    subject: 'You have been invited to StackHR',
    text: `Hi ${fullName}, you have been invited to join your team on StackHR. Accept your invitation: ${invitationUrl} (this link expires in 7 days).`,
    html: layout({
      eyebrow: 'FILE 01 / WELCOME ABOARD',
      title: 'Your team is waiting.',
      body: `Hi ${fullName}, you’ve been invited to join your organization on StackHR.`,
      content: `<p style="margin:0 0 28px;color:${COLORS.muted};font-size:15px;line-height:1.7;">StackHR brings your people, work, and employee experience together in one clear place.</p><a href="${link}" style="display:inline-block;background:${COLORS.tealBright};color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;padding:17px 24px;">ACCEPT INVITATION&nbsp; →</a><p style="margin:24px 0 0;color:#7b858a;font-size:12px;line-height:1.6;">This invitation link expires in <strong>7 days</strong>.</p>`,
    }),
  };
}
