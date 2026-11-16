import { transition } from './state-machine';

const dueAt = new Date('2026-12-01T00:00:00Z');
const graceEnd = new Date('2026-12-08T00:00:00Z'); // due + 7 days

describe('subscription state machine', () => {
  it('moves an ACTIVE subscription to PAST_DUE with a 7-day grace window when an invoice goes overdue', () => {
    const next = transition(
      { status: 'ACTIVE', graceEndsAt: null },
      { type: 'INVOICE_OVERDUE', dueAt },
    );

    expect(next).toEqual({ status: 'PAST_DUE', graceEndsAt: graceEnd });
  });

  it('restricts a PAST_DUE subscription once the grace window has ended, but not before', () => {
    const pastDue = { status: 'PAST_DUE' as const, graceEndsAt: graceEnd };

    expect(
      transition(pastDue, {
        type: 'GRACE_CHECK',
        now: new Date('2026-12-07T23:59:00Z'),
      }),
    ).toEqual(pastDue);
    expect(transition(pastDue, { type: 'GRACE_CHECK', now: graceEnd })).toEqual(
      { status: 'RESTRICTED', graceEndsAt: graceEnd },
    );
  });

  it.each(['FREE', 'PAST_DUE', 'RESTRICTED'] as const)(
    'reactivates a %s subscription and clears grace when an invoice is paid',
    (status) => {
      const next = transition(
        { status, graceEndsAt: graceEnd },
        { type: 'INVOICE_PAID' },
      );

      expect(next).toEqual({ status: 'ACTIVE', graceEndsAt: null });
    },
  );

  it('does not put a FREE org into PAST_DUE when an abandoned upgrade invoice goes overdue', () => {
    const free = { status: 'FREE' as const, graceEndsAt: null };

    expect(transition(free, { type: 'INVOICE_OVERDUE', dueAt })).toEqual(free);
  });
});
