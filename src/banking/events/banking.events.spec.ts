import { BANKING_EVENTS } from './banking.events';

describe('BANKING_EVENTS', () => {
  it('should define all banking event constants correctly', () => {
    expect(BANKING_EVENTS.PAYROLL_TRANSFERS_INITIATED).toBe(
      'anchor.payroll_transfers.initiated',
    );
    expect(BANKING_EVENTS.SINGLE_TRANSFER_INITIATED).toBe(
      'anchor.single_transfer.initiated',
    );
    expect(BANKING_EVENTS.CORPORATE_CARD_ISSUED).toBe('corporate_card.issued');
    expect(BANKING_EVENTS.CORPORATE_CARD_FROZEN).toBe('corporate_card.frozen');
    expect(BANKING_EVENTS.CORPORATE_CARD_UNFROZEN).toBe(
      'corporate_card.unfrozen',
    );
    expect(BANKING_EVENTS.CORPORATE_CARD_LIMIT_UPDATED).toBe(
      'corporate_card.limit_updated',
    );
    expect(BANKING_EVENTS.DEPOSIT_ACCOUNT_CREATED).toBe(
      'anchor.deposit_account.created',
    );
    expect(BANKING_EVENTS.DEPOSIT_ACCOUNT_SYNCED).toBe(
      'anchor.deposit_account.synced',
    );
    expect(BANKING_EVENTS.DEPOSIT_SUCCESSFUL).toBe('anchor.deposit.successful');
    expect(BANKING_EVENTS.PAYROLL_RUN_RECONCILED).toBe(
      'payroll_run.reconciled',
    );
    expect(BANKING_EVENTS.SALARY_ADVANCE_DISBURSED).toBe(
      'salary_advance.disbursed',
    );
    expect(BANKING_EVENTS.REIMBURSEMENT_PAID).toBe('reimbursement.paid');
    expect(BANKING_EVENTS.CORPORATE_CARD_TRANSACTION_MATCHED).toBe(
      'corporate_card.transaction.matched',
    );
  });
});
