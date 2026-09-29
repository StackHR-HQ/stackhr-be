const DEFAULT_APP_URL = 'https://app.stackhr.app';
const DEFAULT_UNSUBSCRIBE_URL = 'https://stackhr.app';

export interface TransactionalEmail {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Brand tokens matching the new template
// ---------------------------------------------------------------------------
const COLORS = {
  // Page
  canvas: '#f6f8fb',
  // Card
  cardBg: '#ffffff',
  cardBorder: '#e7ebf0',
  // Text
  heading: '#101828',
  body: '#344054',
  muted: '#475467',
  subtle: '#94a3b8',
  // Brand
  blue: '#2563eb',
  // Footer
  footerBg: '#0f172a',
  footerText: '#cbd5e1',
  footerSubtle: '#94a3b8',
  footerLink: '#ffffff',
  // Divider
  divider: '#eef1f5',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[ch];
  });
}

function appUrl(): string {
  return (
    process.env.STACKHR_APP_URL ??
    process.env.FRONTEND_URL?.split(',')[0]?.trim() ??
    DEFAULT_APP_URL
  ).replace(/\/+$/, '');
}

function unsubscribeUrl(): string {
  return process.env.STACKHR_UNSUBSCRIBE_URL ?? DEFAULT_UNSUBSCRIBE_URL;
}

// ---------------------------------------------------------------------------
// Shared layout
// Accepts preheader text, optional eyebrow label, headline, optional intro
// paragraph, arbitrary body HTML, and an optional CTA.
// ---------------------------------------------------------------------------
function layout(input: {
  subject: string;
  preheader: string;
  eyebrow?: string;
  headline: string;
  intro?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaText?: string;
}): string {
  const safeSubject = escapeHtml(input.subject);
  const safePreheader = escapeHtml(input.preheader);
  const safeHeadline = escapeHtml(input.headline);
  const safeIntro = input.intro ? escapeHtml(input.intro) : null;
  const safeCtaUrl = input.ctaUrl ? escapeHtml(input.ctaUrl) : null;
  const safeCtaText = input.ctaText ? escapeHtml(input.ctaText) : null;
  const safeUnsubscribe = escapeHtml(unsubscribeUrl());
  const safeAppUrl = escapeHtml('https://stackhr.app');

  const eyebrowBlock = input.eyebrow
    ? `<div style="margin:0 0 14px 0;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${COLORS.blue};">${escapeHtml(input.eyebrow)}</div>`
    : '';

  const introBlock = safeIntro
    ? `<p style="margin:0 0 20px 0;font-size:16px;line-height:26px;color:${COLORS.muted};">${safeIntro}</p>`
    : '';

  const ctaBlock =
    safeCtaUrl && safeCtaText
      ? `<tr>
          <td style="padding:18px 32px 38px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td bgcolor="${COLORS.blue}" style="border-radius:9px;">
                  <a href="${safeCtaUrl}" target="_blank" style="display:inline-block;padding:13px 22px;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">${safeCtaText}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};font-family:Arial,Helvetica,sans-serif;color:${COLORS.heading};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${COLORS.canvas};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${COLORS.cardBg};border:1px solid ${COLORS.cardBorder};border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px 32px;border-bottom:1px solid ${COLORS.divider};">
              <img src="https://stackhr.app/images/stackhr-logo.svg" alt="StackHR" width="132" height="auto" style="display:block;width:132px;max-width:132px;height:auto;border:0;font-size:20px;font-weight:700;color:${COLORS.blue};">
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              ${eyebrowBlock}
              <h1 style="margin:0 0 18px 0;font-size:32px;line-height:39px;font-weight:700;letter-spacing:-0.7px;color:${COLORS.heading};">${safeHeadline}</h1>
              ${introBlock}
              <div style="font-size:16px;line-height:26px;color:${COLORS.body};">
                ${input.bodyHtml}
              </div>
            </td>
          </tr>

          <!-- CTA -->
          ${ctaBlock}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px;background:${COLORS.footerBg};color:${COLORS.footerText};">
              <div style="margin:0 0 7px 0;font-size:16px;line-height:22px;font-weight:700;color:${COLORS.footerLink};">StackHR Limited</div>
              <div style="margin:0 0 18px 0;font-size:13px;line-height:20px;color:${COLORS.footerSubtle};">Modern HR and Payroll for Growing Businesses</div>

              <div style="font-size:13px;line-height:21px;color:${COLORS.footerText};">
                <a href="${safeAppUrl}" target="_blank" style="color:${COLORS.footerLink};text-decoration:none;">stackhr.app</a><br>
                <a href="mailto:hello@stackhr.app" style="color:${COLORS.footerLink};text-decoration:none;">hello@stackhr.app</a>
                &nbsp;·&nbsp;
                <a href="mailto:support@stackhr.app" style="color:${COLORS.footerLink};text-decoration:none;">support@stackhr.app</a><br>
                +234 808 735 5269
              </div>

              <div style="margin-top:18px;font-size:12px;line-height:19px;color:${COLORS.footerSubtle};">
                Plot 681, Cadastral Zone C, OO, Research &amp; Institution Area, Airport Road, Jabi, Abuja 900108, FCT, Nigeria
              </div>

              <div style="margin-top:18px;font-size:12px;line-height:19px;">
                <a href="${safeAppUrl}/privacy" target="_blank" style="color:${COLORS.footerText};text-decoration:underline;">Privacy Policy</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${safeAppUrl}/terms" target="_blank" style="color:${COLORS.footerText};text-decoration:underline;">Terms</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${safeUnsubscribe}" target="_blank" style="color:${COLORS.footerText};text-decoration:underline;">Unsubscribe</a>
              </div>

              <div style="margin-top:18px;font-size:11px;line-height:17px;color:${COLORS.footerSubtle};">
                You are receiving this email because you joined the StackHR waitlist or have an existing relationship with StackHR.
              </div>

              <div style="margin-top:14px;font-size:11px;line-height:17px;color:${COLORS.footerSubtle};">
                &copy; ${new Date().getUTCFullYear()} StackHR Limited. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email: Email verification OTP
// ---------------------------------------------------------------------------
export function verificationEmail(code: string): TransactionalEmail {
  const subject = 'Your StackHR verification code';
  const safeCode = escapeHtml(code);

  return {
    subject,
    text: `Your StackHR verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can safely ignore this email.`,
    html: layout({
      subject,
      preheader: `Your one-time code is ${code}. It expires in 10 minutes.`,
      eyebrow: 'Email Verification',
      headline: 'Confirm your email address.',
      intro: 'Use the one-time code below to finish setting up your StackHR account.',
      bodyHtml: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <tr>
            <td align="center" style="padding:24px 16px 20px;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${COLORS.blue};">Your one-time code</p>
              <p style="margin:0;font-size:38px;line-height:46px;font-weight:700;letter-spacing:10px;color:${COLORS.heading};">${safeCode}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:${COLORS.muted};">This code expires in <strong style="color:${COLORS.heading};">10 minutes</strong> and can only be used once.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:${COLORS.subtle};">If you did not request this code, you can safely ignore this email.</p>
      `,
      ctaUrl: escapeHtml(appUrl()),
      ctaText: 'Open StackHR',
    }),
  };
}

// ---------------------------------------------------------------------------
// Email: Team invitation
// ---------------------------------------------------------------------------
export function invitationEmail(
  fullName: string,
  invitationUrl: string,
): TransactionalEmail {
  const subject = 'You have been invited to StackHR';
  const safeName = escapeHtml(fullName);

  return {
    subject,
    text: `Hi ${fullName}, you have been invited to join your team on StackHR. Accept your invitation here: ${invitationUrl}\n\nThis link expires in 7 days.`,
    html: layout({
      subject,
      preheader: `${fullName}, your team is waiting for you on StackHR.`,
      eyebrow: 'Team Invitation',
      headline: 'Your team is waiting.',
      intro: `Hi ${safeName}, you've been invited to join your organization on StackHR.`,
      bodyHtml: `
        <p style="margin:0 0 20px 0;font-size:15px;line-height:25px;color:${COLORS.muted};">StackHR brings your people, payroll, and employee experience together in one clear place.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:${COLORS.subtle};">This invitation link expires in <strong style="color:${COLORS.heading};">7 days</strong>.</p>
      `,
      ctaUrl: escapeHtml(invitationUrl),
      ctaText: 'Accept Invitation',
    }),
  };
}

// ---------------------------------------------------------------------------
// Email: Approval decision (approved or rejected)
// ---------------------------------------------------------------------------
const REQUEST_TYPE_LABELS: Record<string, string> = {
  LEAVE: 'Leave Request',
  EXPENSE: 'Expense Claim',
  REIMBURSEMENT: 'Reimbursement',
  SALARY_ADVANCE: 'Salary Advance',
  PAYROLL: 'Payroll Run',
};

function humanizeRequestType(type: string): string {
  return REQUEST_TYPE_LABELS[type] ?? type;
}

export function approvalDecisionEmail(input: {
  requesterName: string;
  requestType: string;
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  approvalRequestId: string;
}): TransactionalEmail {
  const isApproved = input.status === 'APPROVED';
  const typeLabel = humanizeRequestType(input.requestType);
  const statusLabel = isApproved ? 'Approved' : 'Rejected';
  const firstName = input.requesterName.trim().split(' ')[0] || 'there';
  const subject = `Your ${typeLabel} has been ${statusLabel}`;

  const text = isApproved
    ? `Hi ${input.requesterName.trim()},\n\nYour ${typeLabel} (ref: ${input.approvalRequestId}) has been approved.\n\nLog in to StackHR to view the details.\n\n${appUrl()}`
    : `Hi ${input.requesterName.trim()},\n\nYour ${typeLabel} (ref: ${input.approvalRequestId}) was not approved.${input.rejectionReason ? `\n\nReason: ${input.rejectionReason}` : ''}\n\nLog in to StackHR to review the outcome or submit a revised request.\n\n${appUrl()}`;

  const statusBadge = isApproved
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0;font-size:15px;line-height:24px;font-weight:600;color:#166534;">&#10003;&nbsp; This request has been approved.</p>
          </td>
        </tr>
      </table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#b91c1c;">Reason for rejection</p>
            <p style="margin:0;font-size:15px;line-height:24px;color:#7f1d1d;">${escapeHtml(input.rejectionReason ?? 'No reason was provided.')}</p>
          </td>
        </tr>
      </table>`;

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: isApproved
        ? `Good news — your ${typeLabel.toLowerCase()} has been approved.`
        : `Your ${typeLabel.toLowerCase()} was not approved. Log in to review the outcome.`,
      eyebrow: 'Approval Decision',
      headline: isApproved
        ? `Your ${typeLabel} is approved.`
        : 'Request not approved.',
      intro: `Hi ${escapeHtml(firstName)}, here is the outcome of your ${typeLabel.toLowerCase()}.`,
      bodyHtml: `
        ${statusBadge}
        <p style="margin:0;font-size:14px;line-height:22px;color:${COLORS.subtle};">Reference: <strong style="color:${COLORS.heading};">${escapeHtml(input.approvalRequestId)}</strong></p>
      `,
      ctaUrl: escapeHtml(appUrl()),
      ctaText: 'View in StackHR',
    }),
  };
}

// ---------------------------------------------------------------------------
// Email: Waitlist confirmation
// ---------------------------------------------------------------------------
export function waitlistConfirmationEmail(fullName: string): TransactionalEmail {
  const rawFirstName = fullName.trim().split(' ')[0] || 'there';
  const firstName = escapeHtml(rawFirstName);
  const subject = 'Welcome to the StackHR Waitlist 💙';

  const text = `Hi ${rawFirstName},

Welcome to the StackHR waitlist.

We're building StackHR to make HR, payroll and spend management simpler for Nigerian businesses, and we're glad to have you joining us early.

As a member of our waitlist, you'll be among the first to receive:
• Important StackHR product updates
• Early looks at what we're building
• Updates as we get closer to launch
• An invitation when StackHR is ready for you to get started

For now, there's nothing else you need to do. We'll keep you updated as we move closer to launch.

If you're joining on behalf of a business and would like to tell us about your current HR, payroll or expense-management process, simply reply to this email. We'd love to hear from you.

Thank you for joining us early.

The StackHR Team
HR. Payroll. Spend. One platform.

https://stackhr.app`;

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: "You're officially on the list. Here's what happens next.",
      eyebrow: 'Waitlist Confirmation',
      headline: `Welcome to the list, ${firstName}.`,
      intro: `Hi ${firstName}, we're glad to have you joining us early.`,
      bodyHtml: `
        <p style="margin:0 0 18px 0;font-size:15px;line-height:25px;color:${COLORS.muted};">We're building StackHR to make HR, payroll and spend management simpler for Nigerian businesses.</p>

        <p style="margin:0 0 12px 0;font-size:15px;line-height:25px;font-weight:700;color:${COLORS.heading};">As a member of our waitlist, you'll be among the first to receive:</p>
        <ul style="margin:0 0 20px 0;padding-left:22px;font-size:15px;line-height:26px;color:${COLORS.muted};">
          <li style="margin-bottom:6px;">Important StackHR product updates</li>
          <li style="margin-bottom:6px;">Early looks at what we're building</li>
          <li style="margin-bottom:6px;">Updates as we get closer to launch</li>
          <li style="margin-bottom:6px;">An invitation when StackHR is ready for you to get started</li>
        </ul>

        <p style="margin:0 0 18px 0;font-size:15px;line-height:25px;color:${COLORS.muted};">For now, there's nothing else you need to do. We'll keep you updated as we move closer to launch.</p>
        <p style="margin:0;font-size:15px;line-height:25px;color:${COLORS.muted};">If you're joining on behalf of a business and would like to tell us about your current HR, payroll or expense-management process, simply reply to this email. We'd love to hear from you.</p>
      `,
      ctaUrl: 'https://stackhr.app',
      ctaText: 'Visit stackhr.app',
    }),
  };
}
