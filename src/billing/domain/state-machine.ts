import type { SubscriptionStatus } from './entitlements';

export const GRACE_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionState {
  status: SubscriptionStatus;
  graceEndsAt: Date | null;
}

export type SubscriptionEvent =
  | { type: 'INVOICE_OVERDUE'; dueAt: Date }
  | { type: 'GRACE_CHECK'; now: Date }
  | { type: 'INVOICE_PAID' };

export function transition(
  state: SubscriptionState,
  event: SubscriptionEvent,
): SubscriptionState {
  switch (event.type) {
    case 'INVOICE_OVERDUE':
      if (state.status !== 'ACTIVE') return state;
      return {
        status: 'PAST_DUE',
        graceEndsAt: new Date(
          event.dueAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS,
        ),
      };

    case 'GRACE_CHECK':
      if (
        state.status !== 'PAST_DUE' ||
        !state.graceEndsAt ||
        event.now < state.graceEndsAt
      ) {
        return state;
      }
      return { ...state, status: 'RESTRICTED' };

    case 'INVOICE_PAID':
      return { status: 'ACTIVE', graceEndsAt: null };
  }
}
