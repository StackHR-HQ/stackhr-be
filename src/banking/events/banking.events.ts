import {
  AnchorBulkTransferResult,
  AnchorSingleTransferResult,
  AnchorWebhookPayload,
} from '../anchor/anchor.types';

export const BANKING_EVENTS = {
  PAYROLL_TRANSFERS_INITIATED: 'anchor.payroll_transfers.initiated',
  SINGLE_TRANSFER_INITIATED: 'anchor.single_transfer.initiated',
  CORPORATE_CARD_ISSUED: 'corporate_card.issued',
  CORPORATE_CARD_FROZEN: 'corporate_card.frozen',
  CORPORATE_CARD_UNFROZEN: 'corporate_card.unfrozen',
  CORPORATE_CARD_LIMIT_UPDATED: 'corporate_card.limit_updated',
  DEPOSIT_ACCOUNT_CREATED: 'anchor.deposit_account.created',
  DEPOSIT_ACCOUNT_SYNCED: 'anchor.deposit_account.synced',
  DEPOSIT_SUCCESSFUL: 'anchor.deposit.successful',
  PAYROLL_RUN_RECONCILED: 'payroll_run.reconciled',
  SALARY_ADVANCE_DISBURSED: 'salary_advance.disbursed',
  REIMBURSEMENT_PAID: 'reimbursement.paid',
  CORPORATE_CARD_TRANSACTION_MATCHED: 'corporate_card.transaction.matched',
} as const;

export type BankingEventType =
  (typeof BANKING_EVENTS)[keyof typeof BANKING_EVENTS];

export interface PayrollTransfersInitiatedEvent {
  organizationId: string;
  runId: string;
  transfersCount: number;
  totalAmountKobo: number;
  bulkTransferResult: AnchorBulkTransferResult;
}

export interface SingleTransferInitiatedEvent {
  organizationId: string;
  amountKobo: number;
  reference: string;
  singleTransferResult: AnchorSingleTransferResult;
}

export interface CorporateCardIssuedEvent {
  cardId: string;
  anchorCardId: string;
  organizationId: string;
  employeeId: string;
}

export interface CorporateCardFrozenEvent {
  cardId: string;
  anchorCardId: string;
  organizationId: string;
  employeeId: string;
}

export interface CorporateCardUnfrozenEvent {
  cardId: string;
  anchorCardId: string;
  organizationId: string;
  employeeId: string;
}

export interface CorporateCardLimitUpdatedEvent {
  cardId: string;
  anchorCardId: string;
  organizationId: string;
  spendingLimitKobo: number;
  spendingInterval: string;
}

export interface DepositAccountCreatedEvent {
  organizationId: string;
  anchorAccountId: string;
  accountNumber: string;
  bankName: string;
}

export interface DepositAccountSyncedEvent {
  organizationId: string;
  anchorAccountId: string;
  availableBalanceKobo: number;
  ledgerBalanceKobo: number;
}

export interface AnchorDepositSuccessfulEvent {
  organizationId: string;
  amountKobo: number;
  reference?: string;
  payload: AnchorWebhookPayload;
}

export interface PayrollRunReconciledEvent {
  payrollRunId: string;
  organizationId: string;
  reference?: string;
  event: string;
}

export interface SalaryAdvanceDisbursedEvent {
  advanceId: string;
  organizationId: string;
  reference?: string;
  event: string;
}

export interface ReimbursementPaidEvent {
  reimbursementId: string;
  organizationId: string;
  reference?: string;
  event: string;
}

export interface CorporateCardTransactionMatchedEvent {
  organizationId: string;
  cardId: string;
  expenseId: string;
  employeeId: string;
  amountMajor: number;
}
