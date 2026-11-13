export interface AnchorBankAttributes {
  nipCode: string;
  name: string;
  cbnCode?: string;
}

export interface AnchorBankResource {
  id: string;
  type: 'Bank';
  attributes: AnchorBankAttributes;
}

export interface AnchorListBanksResponse {
  data: AnchorBankResource[];
}

export interface AnchorAccountDetailAttributes {
  bank: {
    id?: string;
    name: string;
    nipCode: string;
  };
  accountName: string;
  accountNumber: string;
}

export interface AnchorVerifyAccountResponse {
  data: {
    id: string;
    type: 'AccountDetail';
    attributes: AnchorAccountDetailAttributes;
  };
}

export interface BankItem {
  id: string;
  name: string;
  nipCode: string;
  cbnCode?: string;
}

export interface VerifiedAccountResult {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
}

export interface AnchorDepositAccountAttributes {
  accountName: string;
  accountNumber: string;
  bank: {
    id?: string;
    name: string;
    nipCode: string;
  };
  currency: string;
  status: string;
  balance?: {
    availableBalance: number;
    ledgerBalance: number;
    currency: string;
  };
}

export interface AnchorCreateDepositAccountResponse {
  data: {
    id: string;
    type: 'DepositAccount' | 'Account';
    attributes: AnchorDepositAccountAttributes;
  };
}

export interface AnchorAccountBalanceAttributes {
  availableBalance: number;
  ledgerBalance: number;
  currency: string;
}

export interface AnchorGetBalanceResponse {
  data: {
    id: string;
    type: 'AccountBalance';
    attributes: AnchorAccountBalanceAttributes;
  };
}

export interface DepositAccountItem {
  id: string;
  organizationId: string;
  anchorAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  nipCode: string;
  currency: string;
  balanceKobo: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnchorWebhookPayload {
  event: string;
  data: {
    id: string;
    type: string;
    attributes: {
      amount?: number;
      fee?: number;
      currency?: string;
      reference?: string;
      status?: string;
      accountId?: string;
      accountNumber?: string;
      sender?: {
        accountName?: string;
        accountNumber?: string;
        bankName?: string;
      };
      createdAt?: string;
      [key: string]: any;
    };
  };
}

export interface CreatedDepositAccount {
  anchorAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  nipCode: string;
  currency: string;
  balanceKobo: number;
}

export interface AccountBalanceResult {
  availableBalanceKobo: number;
  ledgerBalanceKobo: number;
  currency: string;
}

export interface BulkTransferDestination {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

export interface BulkTransferItem {
  amountKobo: number;
  currency?: string;
  reference: string;
  destination: BulkTransferDestination;
  narration?: string;
}

export interface BulkTransferParams {
  sourceAccountId: string;
  transfers: BulkTransferItem[];
}

export interface AnchorBulkTransferResult {
  id: string;
  reference: string;
  status: 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  transfersCount: number;
  totalAmountKobo: number;
}

export interface SingleTransferDestination {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

export interface SingleTransferParams {
  sourceAccountId: string;
  amountKobo: number;
  currency?: string;
  reference: string;
  destination: SingleTransferDestination;
  reason?: string;
}

export interface AnchorSingleTransferResult {
  id: string;
  reference: string;
  status: 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  amountKobo: number;
  currency: string;
  feeKobo?: number;
}

export interface IssueCardParams {
  cardholderName: string;
  email?: string;
  phone?: string;
  currency?: string;
  brand?: 'MASTERCARD' | 'VERVE' | 'VISA';
  spendingLimitKobo: number;
  spendingInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface AnchorCardResult {
  id: string;
  cardName: string;
  maskedPan: string;
  expiryMonth: string;
  expiryYear: string;
  brand: string;
  currency: string;
  status: 'ACTIVE' | 'FROZEN' | 'TERMINATED';
  spendingLimitKobo: number;
  spendingInterval: string;
  balanceKobo?: number;
}

export interface UpdateCardLimitParams {
  cardId: string;
  spendingLimitKobo: number;
  spendingInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}
