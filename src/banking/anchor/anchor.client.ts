import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CircuitBreaker } from '../../common/resilience/circuit-breaker';
import { executeWithRetry } from '../../common/resilience/retry-policy';
import {
  AccountBalanceResult,
  AnchorBulkTransferResult,
  AnchorCardResult,
  AnchorCreateDepositAccountResponse,
  AnchorGetBalanceResponse,
  AnchorListBanksResponse,
  AnchorSingleTransferResult,
  AnchorVerifyAccountResponse,
  BankItem,
  BulkTransferParams,
  CreatedDepositAccount,
  IssueCardParams,
  SingleTransferParams,
  UpdateCardLimitParams,
  VerifiedAccountResult,
} from './anchor.types';
import {
  createMockBalanceResponse,
  createMockBulkTransferResponse,
  createMockCardResponse,
  createMockDepositAccountResponse,
  createMockSingleTransferResponse,
  createMockVerifyAccountResponse,
  MOCK_NIGERIAN_BANKS,
} from './anchor.fixtures';

@Injectable()
export class AnchorClient {
  private readonly logger = new Logger(AnchorClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.baseUrl =
      process.env.ANCHOR_BASE_URL?.replace(/\/+$/, '') ??
      'https://api.sandbox.getanchor.co';
    this.apiKey = process.env.ANCHOR_API_KEY;
    this.circuitBreaker = new CircuitBreaker({
      name: 'AnchorBaaS',
      failureThreshold: 5,
      recoveryTimeoutMs: 30000,
    });
  }

  private isMockMode(): boolean {
    return !this.apiKey || process.env.NODE_ENV === 'test';
  }

  async getBanks(): Promise<BankItem[]> {
    if (this.isMockMode()) {
      this.logger.debug(
        'ANCHOR_API_KEY missing or in test mode; returning mock Nigerian bank catalog.',
      );
      return MOCK_NIGERIAN_BANKS.map((b) => ({
        id: b.id,
        name: b.attributes.name,
        nipCode: b.attributes.nipCode,
        cbnCode: b.attributes.cbnCode,
      }));
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/banks`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Anchor list banks failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor banking rail is temporarily unavailable',
              );
            }
            throw new BadRequestException(
              'Failed to retrieve bank catalog from Anchor',
            );
          }

          const json = (await response.json()) as AnchorListBanksResponse;
          return (json.data ?? []).map((b) => ({
            id: b.id,
            name: b.attributes.name,
            nipCode: b.attributes.nipCode,
            cbnCode: b.attributes.cbnCode,
          }));
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async verifyAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<VerifiedAccountResult> {
    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; simulating account verification for ${accountNumber} (${bankCode})`,
      );
      const mock = createMockVerifyAccountResponse(bankCode, accountNumber);
      return {
        accountNumber: mock.data.attributes.accountNumber,
        accountName: mock.data.attributes.accountName,
        bankCode: mock.data.attributes.bank.nipCode,
        bankName: mock.data.attributes.bank.name,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/payments/verify-account/${encodeURIComponent(
            bankCode,
          )}/${encodeURIComponent(accountNumber)}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.warn(
              `Anchor verify-account failed [${response.status}] for ${accountNumber}: ${errorText}`,
            );

            if (response.status === 404) {
              throw new NotFoundException(
                `Bank account ${accountNumber} not found for bank code ${bankCode}`,
              );
            }
            if (response.status === 400 || response.status === 422) {
              throw new BadRequestException(
                `Invalid bank account or bank code provided: ${accountNumber}`,
              );
            }
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor account verification rail is temporarily unavailable',
              );
            }
            throw new BadRequestException('Account verification failed');
          }

          const json = (await response.json()) as AnchorVerifyAccountResponse;
          const attr = json.data.attributes;

          return {
            accountNumber: attr.accountNumber,
            accountName: attr.accountName,
            bankCode: attr.bank.nipCode,
            bankName: attr.bank.name,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async createDepositAccount(
    accountName: string,
  ): Promise<CreatedDepositAccount> {
    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; generating mock deposit account for "${accountName}"`,
      );
      const mock = createMockDepositAccountResponse(accountName);
      return {
        anchorAccountId: mock.data.id,
        accountNumber: mock.data.attributes.accountNumber,
        accountName: mock.data.attributes.accountName,
        bankName: mock.data.attributes.bank.name,
        nipCode: mock.data.attributes.bank.nipCode,
        currency: mock.data.attributes.currency,
        balanceKobo: mock.data.attributes.balance?.availableBalance ?? 0,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/accounts`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            body: JSON.stringify({
              data: {
                type: 'DepositAccount',
                attributes: {
                  accountName,
                  currency: 'NGN',
                },
              },
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Anchor create deposit account failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor deposit account generation is temporarily unavailable',
              );
            }
            throw new BadRequestException(
              'Failed to generate organization deposit account on Anchor',
            );
          }

          const json =
            (await response.json()) as AnchorCreateDepositAccountResponse;
          const attr = json.data.attributes;

          return {
            anchorAccountId: json.data.id,
            accountNumber: attr.accountNumber,
            accountName: attr.accountName,
            bankName: attr.bank?.name ?? 'PROVIDUS BANK',
            nipCode: attr.bank?.nipCode ?? '000023',
            currency: attr.currency ?? 'NGN',
            balanceKobo: attr.balance?.availableBalance ?? 0,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async getAccountBalance(
    anchorAccountId: string,
  ): Promise<AccountBalanceResult> {
    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; simulating balance inquiry for "${anchorAccountId}"`,
      );
      const mock = createMockBalanceResponse(anchorAccountId);
      return {
        availableBalanceKobo: mock.data.attributes.availableBalance,
        ledgerBalanceKobo: mock.data.attributes.ledgerBalance,
        currency: mock.data.attributes.currency,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/accounts/${encodeURIComponent(
            anchorAccountId,
          )}/balance`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.warn(
              `Anchor get balance failed [${response.status}] for ${anchorAccountId}: ${errorText}`,
            );
            if (response.status === 404) {
              throw new NotFoundException(
                `Anchor deposit account ${anchorAccountId} not found`,
              );
            }
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor balance inquiry rail is temporarily unavailable',
              );
            }
            throw new BadRequestException('Failed to retrieve account balance');
          }

          const json = (await response.json()) as AnchorGetBalanceResponse;
          const attr = json.data.attributes;

          return {
            availableBalanceKobo: attr.availableBalance,
            ledgerBalanceKobo: attr.ledgerBalance,
            currency: attr.currency,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async initiateBulkTransfer(
    params: BulkTransferParams,
  ): Promise<AnchorBulkTransferResult> {
    const totalKobo = params.transfers.reduce(
      (acc, t) => acc + t.amountKobo,
      0,
    );

    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; simulating bulk transfer of ${params.transfers.length} transfers totaling ${totalKobo} kobo from "${params.sourceAccountId}"`,
      );
      const mock = createMockBulkTransferResponse(
        params.transfers.length,
        totalKobo,
      );
      return {
        id: mock.data.id,
        reference: mock.data.attributes.reference,
        status: mock.data.attributes.status,
        transfersCount: mock.data.attributes.transfersCount,
        totalAmountKobo: mock.data.attributes.totalAmount,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/transfers/bulk`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            body: JSON.stringify({
              data: {
                type: 'BulkTransfer',
                attributes: {
                  sourceAccountId: params.sourceAccountId,
                  transfers: params.transfers.map((t) => ({
                    amount: t.amountKobo,
                    currency: t.currency ?? 'NGN',
                    reference: t.reference,
                    destination: {
                      accountNumber: t.destination.accountNumber,
                      bankCode: t.destination.bankCode,
                      accountName: t.destination.accountName,
                    },
                    reason: t.narration ?? 'Salary Disbursement',
                  })),
                },
              },
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Anchor bulk transfer failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor transfer rails are temporarily unavailable',
              );
            }
            if (response.status === 400 || response.status === 422) {
              throw new BadRequestException(
                `Bulk transfer rejected by Anchor: ${errorText}`,
              );
            }
            throw new BadRequestException('Failed to initiate bulk transfer');
          }

          const json = await response.json();
          const attr = json.data?.attributes;

          return {
            id: json.data?.id ?? `blk_${Date.now()}`,
            reference: attr?.reference ?? `blk_ref_${Date.now()}`,
            status: attr?.status ?? 'PROCESSING',
            transfersCount: params.transfers.length,
            totalAmountKobo: totalKobo,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async initiateSingleTransfer(
    params: SingleTransferParams,
  ): Promise<AnchorSingleTransferResult> {
    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; simulating single transfer of ${params.amountKobo} kobo to ${params.destination.accountNumber} with reference "${params.reference}"`,
      );
      const mock = createMockSingleTransferResponse(
        params.amountKobo,
        params.reference,
      );
      return {
        id: mock.data.id,
        reference: mock.data.attributes.reference,
        status: mock.data.attributes.status,
        amountKobo: mock.data.attributes.amount,
        currency: mock.data.attributes.currency,
        feeKobo: mock.data.attributes.fee,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/transfers`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            body: JSON.stringify({
              data: {
                type: 'Transfer',
                attributes: {
                  sourceAccountId: params.sourceAccountId,
                  amount: params.amountKobo,
                  currency: params.currency ?? 'NGN',
                  reference: params.reference,
                  destination: {
                    accountNumber: params.destination.accountNumber,
                    bankCode: params.destination.bankCode,
                    accountName: params.destination.accountName,
                  },
                  reason: params.reason ?? 'Instant Spend Payout',
                },
              },
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Anchor single transfer failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor transfer rails are temporarily unavailable',
              );
            }
            if (response.status === 400 || response.status === 422) {
              throw new BadRequestException(
                `Transfer rejected by Anchor: ${errorText}`,
              );
            }
            throw new BadRequestException('Failed to initiate single transfer');
          }

          const json = await response.json();
          const attr = json.data?.attributes;

          return {
            id: json.data?.id ?? `trf_${Date.now()}`,
            reference: attr?.reference ?? params.reference,
            status: attr?.status ?? 'PROCESSING',
            amountKobo: attr?.amount ?? params.amountKobo,
            currency: attr?.currency ?? 'NGN',
            feeKobo: attr?.fee ?? 1075,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async issueCard(params: IssueCardParams): Promise<AnchorCardResult> {
    if (this.isMockMode()) {
      this.logger.debug(
        `ANCHOR_API_KEY missing or in test mode; simulating card issuance for "${params.cardholderName}"`,
      );
      const mock = createMockCardResponse(
        params.cardholderName,
        params.spendingLimitKobo,
        params.spendingInterval ?? 'MONTHLY',
      );
      const attr = mock.data.attributes;
      return {
        id: mock.data.id,
        cardName: attr.cardName,
        maskedPan: attr.maskedPan,
        expiryMonth: attr.expiryMonth,
        expiryYear: attr.expiryYear,
        brand: attr.brand,
        currency: attr.currency,
        status: attr.status,
        spendingLimitKobo: attr.spendingLimit.amount,
        spendingInterval: attr.spendingLimit.interval,
        balanceKobo: attr.balance.availableBalance,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/cards`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            body: JSON.stringify({
              data: {
                type: 'Card',
                attributes: {
                  type: 'VIRTUAL',
                  brand: params.brand ?? 'MASTERCARD',
                  currency: params.currency ?? 'NGN',
                  cardholder: {
                    name: params.cardholderName,
                    email: params.email,
                    phone: params.phone,
                  },
                  spendingLimit: {
                    amount: params.spendingLimitKobo,
                    interval: params.spendingInterval ?? 'MONTHLY',
                  },
                },
              },
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
              `Anchor card issuance failed [${response.status}]: ${errorText}`,
            );
            if (response.status >= 500) {
              throw new ServiceUnavailableException(
                'Anchor card issuance is temporarily unavailable',
              );
            }
            throw new BadRequestException(
              `Failed to issue card on Anchor: ${errorText}`,
            );
          }

          const json = await response.json();
          const attr = json.data?.attributes;

          return {
            id: json.data?.id,
            cardName: attr?.cardName ?? params.cardholderName,
            maskedPan: attr?.maskedPan ?? '5399 **** **** 0000',
            expiryMonth: attr?.expiryMonth ?? '12',
            expiryYear: attr?.expiryYear ?? '28',
            brand: attr?.brand ?? 'MASTERCARD',
            currency: attr?.currency ?? 'NGN',
            status: attr?.status ?? 'ACTIVE',
            spendingLimitKobo:
              attr?.spendingLimit?.amount ?? params.spendingLimitKobo,
            spendingInterval:
              attr?.spendingLimit?.interval ??
              params.spendingInterval ??
              'MONTHLY',
            balanceKobo:
              attr?.balance?.availableBalance ?? params.spendingLimitKobo,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async getCard(anchorCardId: string): Promise<AnchorCardResult> {
    if (this.isMockMode()) {
      const mock = createMockCardResponse('Mock Employee');
      const attr = mock.data.attributes;
      return {
        id: anchorCardId,
        cardName: attr.cardName,
        maskedPan: attr.maskedPan,
        expiryMonth: attr.expiryMonth,
        expiryYear: attr.expiryYear,
        brand: attr.brand,
        currency: attr.currency,
        status: attr.status,
        spendingLimitKobo: attr.spendingLimit.amount,
        spendingInterval: attr.spendingLimit.interval,
        balanceKobo: attr.balance.availableBalance,
      };
    }

    return this.circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const url = `${this.baseUrl}/api/v1/cards/${anchorCardId}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-anchor-key': this.apiKey!,
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new NotFoundException(
                `Card with Anchor ID "${anchorCardId}" not found`,
              );
            }
            throw new BadRequestException(
              'Failed to fetch card details from Anchor',
            );
          }

          const json = await response.json();
          const attr = json.data?.attributes;

          return {
            id: json.data?.id ?? anchorCardId,
            cardName: attr?.cardName ?? 'Corporate Card',
            maskedPan: attr?.maskedPan ?? '5399 **** **** 0000',
            expiryMonth: attr?.expiryMonth ?? '12',
            expiryYear: attr?.expiryYear ?? '28',
            brand: attr?.brand ?? 'MASTERCARD',
            currency: attr?.currency ?? 'NGN',
            status: attr?.status ?? 'ACTIVE',
            spendingLimitKobo: attr?.spendingLimit?.amount ?? 0,
            spendingInterval: attr?.spendingLimit?.interval ?? 'MONTHLY',
            balanceKobo: attr?.balance?.availableBalance ?? 0,
          };
        },
        { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 },
      );
    });
  }

  async freezeCard(
    anchorCardId: string,
  ): Promise<{ id: string; status: 'FROZEN' }> {
    if (this.isMockMode()) {
      return { id: anchorCardId, status: 'FROZEN' };
    }

    return this.circuitBreaker.execute(async () => {
      const url = `${this.baseUrl}/api/v1/cards/${anchorCardId}/freeze`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-anchor-key': this.apiKey!,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new BadRequestException('Failed to freeze card on Anchor');
      }

      return { id: anchorCardId, status: 'FROZEN' };
    });
  }

  async unfreezeCard(
    anchorCardId: string,
  ): Promise<{ id: string; status: 'ACTIVE' }> {
    if (this.isMockMode()) {
      return { id: anchorCardId, status: 'ACTIVE' };
    }

    return this.circuitBreaker.execute(async () => {
      const url = `${this.baseUrl}/api/v1/cards/${anchorCardId}/unfreeze`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-anchor-key': this.apiKey!,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new BadRequestException('Failed to unfreeze card on Anchor');
      }

      return { id: anchorCardId, status: 'ACTIVE' };
    });
  }

  async updateCardLimit(params: UpdateCardLimitParams): Promise<{
    id: string;
    spendingLimitKobo: number;
    spendingInterval: string;
  }> {
    if (this.isMockMode()) {
      return {
        id: params.cardId,
        spendingLimitKobo: params.spendingLimitKobo,
        spendingInterval: params.spendingInterval ?? 'MONTHLY',
      };
    }

    return this.circuitBreaker.execute(async () => {
      const url = `${this.baseUrl}/api/v1/cards/${params.cardId}/spending-limit`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-anchor-key': this.apiKey!,
        },
        body: JSON.stringify({
          data: {
            type: 'CardLimit',
            attributes: {
              amount: params.spendingLimitKobo,
              interval: params.spendingInterval ?? 'MONTHLY',
            },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new BadRequestException(
          'Failed to update card spending limit on Anchor',
        );
      }

      return {
        id: params.cardId,
        spendingLimitKobo: params.spendingLimitKobo,
        spendingInterval: params.spendingInterval ?? 'MONTHLY',
      };
    });
  }
}
