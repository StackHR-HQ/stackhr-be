import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { AnchorClient } from './anchor/anchor.client';
import {
  AnchorBulkTransferResult,
  AnchorSingleTransferResult,
  AnchorWebhookPayload,
  BankItem,
  BulkTransferItem,
  SingleTransferParams,
  VerifiedAccountResult,
} from './anchor/anchor.types';

import { randomUUID } from 'node:crypto';
import { BANKING_EVENTS } from './events/banking.events';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { IssueCardDto } from './dto/issue-card.dto';
import { UpdateCardLimitDto } from './dto/update-card-limit.dto';
import { ToggleCardFreezeDto } from './dto/toggle-card-freeze.dto';

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);
  private cachedBanks: BankItem[] | null = null;
  private cacheExpiresAt: number = 0;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly anchorClient: AnchorClient,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getBanks(): Promise<BankItem[]> {
    const now = Date.now();
    if (this.cachedBanks && now < this.cacheExpiresAt) {
      this.logger.debug('Returning cached Nigerian banks catalog.');
      return this.cachedBanks;
    }

    const banks = await this.anchorClient.getBanks();
    this.cachedBanks = banks;
    this.cacheExpiresAt = now + this.CACHE_TTL_MS;
    return banks;
  }

  async verifyAccount(dto: VerifyAccountDto): Promise<VerifiedAccountResult> {
    return this.anchorClient.verifyAccount(dto.bankCode, dto.accountNumber);
  }

  async getDepositAccount(organizationId: string) {
    const existing = await this.prisma.organizationDepositAccount.findUnique({
      where: { organizationId },
    });

    if (existing) {
      return existing;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException(
        `Organization ${organizationId} does not exist`,
      );
    }

    const created = await this.anchorClient.createDepositAccount(
      organization.name,
    );

    const createdAccount = await this.prisma.organizationDepositAccount.create({
      data: {
        organizationId,
        anchorAccountId: created.anchorAccountId,
        accountNumber: created.accountNumber,
        accountName: created.accountName,
        bankName: created.bankName,
        nipCode: created.nipCode,
        currency: created.currency,
        balanceKobo: BigInt(created.balanceKobo),
        status: 'ACTIVE',
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.DEPOSIT_ACCOUNT_CREATED, {
      organizationId,
      anchorAccountId: created.anchorAccountId,
      accountNumber: created.accountNumber,
      bankName: created.bankName,
    });

    return createdAccount;
  }

  async syncDepositAccountBalance(organizationId: string) {
    const account = await this.getDepositAccount(organizationId);

    const balance = await this.anchorClient.getAccountBalance(
      account.anchorAccountId,
    );

    const updated = await this.prisma.organizationDepositAccount.update({
      where: { id: account.id },
      data: {
        balanceKobo: BigInt(balance.availableBalanceKobo),
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.DEPOSIT_ACCOUNT_SYNCED, {
      organizationId,
      anchorAccountId: account.anchorAccountId,
      availableBalanceKobo: balance.availableBalanceKobo,
      ledgerBalanceKobo: balance.ledgerBalanceKobo,
    });

    return updated;
  }

  async executePayrollTransfers(
    organizationId: string,
    runId: string,
    transfers: BulkTransferItem[],
  ): Promise<AnchorBulkTransferResult> {
    const depositAccount = await this.getDepositAccount(organizationId);

    const totalKobo = transfers.reduce((acc, t) => acc + t.amountKobo, 0);

    if (depositAccount.balanceKobo < BigInt(totalKobo)) {
      throw new BadRequestException(
        `Insufficient balance in organization deposit account. Required: ${totalKobo / 100} NGN, Available: ${Number(depositAccount.balanceKobo) / 100} NGN`,
      );
    }

    const bulkTransferResult = await this.anchorClient.initiateBulkTransfer({
      sourceAccountId: depositAccount.anchorAccountId,
      transfers,
    });

    // Deduct total transfer volume from deposit account balance ledger
    await this.prisma.organizationDepositAccount.update({
      where: { id: depositAccount.id },
      data: {
        balanceKobo: { decrement: BigInt(totalKobo) },
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.PAYROLL_TRANSFERS_INITIATED, {
      organizationId,
      runId,
      transfersCount: transfers.length,
      totalAmountKobo: totalKobo,
      bulkTransferResult,
    });

    return bulkTransferResult;
  }

  async executeSingleTransfer(
    organizationId: string,
    params: Omit<SingleTransferParams, 'sourceAccountId'>,
  ): Promise<AnchorSingleTransferResult> {
    const depositAccount = await this.getDepositAccount(organizationId);

    if (depositAccount.balanceKobo < BigInt(params.amountKobo)) {
      throw new BadRequestException(
        `Insufficient balance in organization deposit account. Required: ${params.amountKobo / 100} NGN, Available: ${Number(depositAccount.balanceKobo) / 100} NGN`,
      );
    }

    const singleTransferResult = await this.anchorClient.initiateSingleTransfer(
      {
        sourceAccountId: depositAccount.anchorAccountId,
        amountKobo: params.amountKobo,
        currency: params.currency ?? 'NGN',
        reference: params.reference,
        destination: params.destination,
        reason: params.reason,
      },
    );

    // Deduct transfer volume from deposit account balance ledger
    await this.prisma.organizationDepositAccount.update({
      where: { id: depositAccount.id },
      data: {
        balanceKobo: { decrement: BigInt(params.amountKobo) },
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.SINGLE_TRANSFER_INITIATED, {
      organizationId,
      amountKobo: params.amountKobo,
      reference: params.reference,
      singleTransferResult,
    });

    return singleTransferResult;
  }

  async issueCorporateCard(organizationId: string, dto: IssueCardDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with ID "${dto.employeeId}" not found in organization`,
      );
    }

    const anchorCard = await this.anchorClient.issueCard({
      cardholderName: employee.fullName,
      email: employee.email,
      phone: employee.phone ?? undefined,
      brand: dto.brand ?? 'MASTERCARD',
      spendingLimitKobo: dto.spendingLimitKobo,
      spendingInterval: dto.spendingInterval ?? 'MONTHLY',
    });

    const card = await this.prisma.corporateCard.create({
      data: {
        organizationId,
        employeeId: employee.id,
        anchorCardId: anchorCard.id,
        cardName: anchorCard.cardName,
        maskedPan: anchorCard.maskedPan,
        expiryMonth: anchorCard.expiryMonth,
        expiryYear: anchorCard.expiryYear,
        brand: anchorCard.brand,
        currency: anchorCard.currency,
        status: anchorCard.status,
        spendingLimitKobo: anchorCard.spendingLimitKobo,
        spendingInterval: anchorCard.spendingInterval,
      },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.CORPORATE_CARD_ISSUED, {
      cardId: card.id,
      anchorCardId: anchorCard.id,
      organizationId,
      employeeId: employee.id,
    });

    return {
      message: 'Corporate card issued successfully',
      card,
    };
  }

  async getCorporateCards(organizationId: string, employeeId?: string) {
    const where: Record<string, string> = { organizationId };
    if (employeeId) {
      where.employeeId = employeeId;
    }

    const cards = await this.prisma.corporateCard.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { cards };
  }

  async getCorporateCardDetails(organizationId: string, cardId: string) {
    const card = await this.prisma.corporateCard.findFirst({
      where: { id: cardId, organizationId },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!card) {
      throw new NotFoundException(`Corporate card "${cardId}" not found`);
    }

    const liveCard = await this.anchorClient
      .getCard(card.anchorCardId)
      .catch(() => null);

    return {
      card,
      liveAnchorDetails: liveCard ?? undefined,
    };
  }

  async toggleCardFreeze(
    organizationId: string,
    cardId: string,
    dto: ToggleCardFreezeDto,
  ) {
    const card = await this.prisma.corporateCard.findFirst({
      where: { id: cardId, organizationId },
    });

    if (!card) {
      throw new NotFoundException(`Corporate card "${cardId}" not found`);
    }

    const newStatus = dto.action === 'FREEZE' ? 'FROZEN' : 'ACTIVE';

    if (dto.action === 'FREEZE') {
      await this.anchorClient.freezeCard(card.anchorCardId);
    } else {
      await this.anchorClient.unfreezeCard(card.anchorCardId);
    }

    const updated = await this.prisma.corporateCard.update({
      where: { id: card.id },
      data: { status: newStatus },
    });

    const eventName =
      dto.action === 'FREEZE'
        ? BANKING_EVENTS.CORPORATE_CARD_FROZEN
        : BANKING_EVENTS.CORPORATE_CARD_UNFROZEN;

    this.eventEmitter.emit(eventName, {
      cardId: card.id,
      anchorCardId: card.anchorCardId,
      organizationId,
      employeeId: card.employeeId,
    });

    return {
      message: `Corporate card ${newStatus.toLowerCase()} successfully`,
      card: updated,
    };
  }

  async updateCardSpendingLimit(
    organizationId: string,
    cardId: string,
    dto: UpdateCardLimitDto,
  ) {
    const card = await this.prisma.corporateCard.findFirst({
      where: { id: cardId, organizationId },
    });

    if (!card) {
      throw new NotFoundException(`Corporate card "${cardId}" not found`);
    }

    const interval = dto.spendingInterval ?? card.spendingInterval;

    await this.anchorClient.updateCardLimit({
      cardId: card.anchorCardId,
      spendingLimitKobo: dto.spendingLimitKobo,
      spendingInterval: interval as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    });

    const updated = await this.prisma.corporateCard.update({
      where: { id: card.id },
      data: {
        spendingLimitKobo: dto.spendingLimitKobo,
        spendingInterval: interval,
      },
    });

    this.eventEmitter.emit(BANKING_EVENTS.CORPORATE_CARD_LIMIT_UPDATED, {
      cardId: card.id,
      anchorCardId: card.anchorCardId,
      organizationId,
      spendingLimitKobo: dto.spendingLimitKobo,
      spendingInterval: interval,
    });

    return {
      message: 'Card spending limit updated successfully',
      card: updated,
    };
  }

  async handleWebhookEvent(payload: AnchorWebhookPayload) {
    const event = payload.event;
    this.logger.log(`Received Anchor webhook event: ${event}`);

    // Inbound funding event
    if (event === 'deposit.successful' || event === 'account.credited') {
      const attributes = payload.data?.attributes;
      const accountId = attributes?.accountId;
      const accountNumber = attributes?.accountNumber;
      const amountKobo = BigInt(attributes?.amount ?? 0);

      const account = await this.prisma.organizationDepositAccount.findFirst({
        where: {
          OR: [
            ...(accountId ? [{ anchorAccountId: accountId }] : []),
            ...(accountNumber ? [{ accountNumber }] : []),
          ],
        },
      });

      if (account) {
        const updated = await this.prisma.organizationDepositAccount.update({
          where: { id: account.id },
          data: {
            balanceKobo: { increment: amountKobo },
          },
        });

        this.eventEmitter.emit(BANKING_EVENTS.DEPOSIT_SUCCESSFUL, {
          organizationId: account.organizationId,
          amountKobo: Number(amountKobo),
          reference: attributes?.reference,
          payload,
        });

        this.logger.log(
          `Credited organization ${account.organizationId} with ${amountKobo} kobo. New balance: ${updated.balanceKobo}`,
        );

        return {
          received: true,
          event,
          organizationId: account.organizationId,
          newBalanceKobo: Number(updated.balanceKobo),
        };
      } else {
        this.logger.warn(
          `No matching deposit account found for Anchor accountId: ${accountId}, accountNumber: ${accountNumber}`,
        );
      }
    }

    // Outbound transfer reconciliation events
    if (
      event === 'bulkTransfer.completed' ||
      event === 'transfer.successful' ||
      event === 'nip.transfer.successful'
    ) {
      const reference = payload.data?.attributes?.reference;
      if (reference && reference.startsWith('pyr_')) {
        const parts = reference.split('_');
        const runId = parts[1];
        if (runId) {
          const run = await this.prisma.payrollRun.findUnique({
            where: { id: runId },
          });

          if (run && run.status !== 'RECONCILED') {
            await this.prisma.payrollRun.update({
              where: { id: runId },
              data: {
                status: 'RECONCILED',
                reconciledAt: new Date(),
              },
            });

            if (this.prisma.auditEvent) {
              await this.prisma.auditEvent
                .create({
                  data: {
                    organizationId: run.organizationId,
                    actorUserId: 'SYSTEM_ANCHOR_WEBHOOK',
                    action: 'payroll_run.reconciled',
                    targetType: 'payroll_run',
                    targetId: run.id,
                    description: `Payroll run "${run.title}" automatically reconciled via Anchor BaaS transfer confirmation`,
                    changes: {
                      status: 'RECONCILED',
                      reference,
                      event,
                    },
                  },
                })
                .catch(() => undefined);
            }

            this.eventEmitter.emit(BANKING_EVENTS.PAYROLL_RUN_RECONCILED, {
              payrollRunId: runId,
              organizationId: run.organizationId,
              reference,
              event,
            });

            this.logger.log(
              `Payroll run ${runId} automatically reconciled via Anchor transfer confirmation [${reference}]`,
            );

            return {
              received: true,
              event,
              reconciledRunId: runId,
            };
          }
        }
      }

      if (reference && reference.startsWith('adv_')) {
        const parts = reference.split('_');
        const advanceId = parts[1];
        if (advanceId) {
          const advance = await this.prisma.salaryAdvance.findUnique({
            where: { id: advanceId },
          });

          if (advance && advance.status !== 'DISBURSED') {
            await this.prisma.salaryAdvance.update({
              where: { id: advanceId },
              data: {
                status: 'DISBURSED',
                disbursedAt: new Date(),
              },
            });

            if (this.prisma.auditEvent) {
              await this.prisma.auditEvent
                .create({
                  data: {
                    organizationId: advance.organizationId,
                    actorUserId: 'SYSTEM_ANCHOR_WEBHOOK',
                    action: 'salary_advance.disbursed',
                    targetType: 'salary_advance',
                    targetId: advance.id,
                    description: `Salary advance of ${advance.amount} automatically disbursed via Anchor single transfer confirmation`,
                    changes: {
                      status: 'DISBURSED',
                      reference,
                      event,
                    },
                  },
                })
                .catch(() => undefined);
            }

            this.eventEmitter.emit(BANKING_EVENTS.SALARY_ADVANCE_DISBURSED, {
              advanceId,
              organizationId: advance.organizationId,
              reference,
              event,
            });

            this.logger.log(
              `Salary advance ${advanceId} marked DISBURSED via Anchor confirmation [${reference}]`,
            );

            return {
              received: true,
              event,
              disbursedAdvanceId: advanceId,
            };
          }
        }
      }

      if (reference && reference.startsWith('rem_')) {
        const parts = reference.split('_');
        const reimbursementId = parts[1];
        if (reimbursementId) {
          const reimbursement = await this.prisma.reimbursement.findUnique({
            where: { id: reimbursementId },
          });

          if (reimbursement && reimbursement.status !== 'PAID') {
            await this.prisma.reimbursement.update({
              where: { id: reimbursementId },
              data: {
                status: 'PAID',
                paidAt: new Date(),
              },
            });

            if (this.prisma.auditEvent) {
              await this.prisma.auditEvent
                .create({
                  data: {
                    organizationId: reimbursement.organizationId,
                    actorUserId: 'SYSTEM_ANCHOR_WEBHOOK',
                    action: 'reimbursement.paid',
                    targetType: 'reimbursement',
                    targetId: reimbursement.id,
                    description: `Reimbursement claim of ${reimbursement.currency} ${reimbursement.amount} automatically marked PAID via Anchor single transfer confirmation`,
                    changes: {
                      status: 'PAID',
                      reference,
                      event,
                    },
                  },
                })
                .catch(() => undefined);
            }

            this.eventEmitter.emit(BANKING_EVENTS.REIMBURSEMENT_PAID, {
              reimbursementId,
              organizationId: reimbursement.organizationId,
              reference,
              event,
            });

            this.logger.log(
              `Reimbursement ${reimbursementId} marked PAID via Anchor confirmation [${reference}]`,
            );

            return {
              received: true,
              event,
              paidReimbursementId: reimbursementId,
            };
          }
        }
      }
    }

    // Card transaction event: auto-create matching pending expense claim
    if (event === 'card.transaction.approved') {
      const attributes = payload.data?.attributes;
      const anchorCardId = attributes?.cardId ?? payload.data?.id;

      if (anchorCardId) {
        const card = await this.prisma.corporateCard.findFirst({
          where: { anchorCardId },
        });

        if (card) {
          const amountKobo = Number(attributes?.amount ?? 0);
          const amountMajor = Math.max(1, Math.round(amountKobo / 100));
          const merchantName =
            attributes?.merchant?.name ?? attributes?.merchantName;
          const description = merchantName
            ? `Corporate Card transaction at ${merchantName}`
            : 'Corporate Card transaction';

          const expense = await this.prisma.expense.create({
            data: {
              id: randomUUID(),
              organizationId: card.organizationId,
              employeeId: card.employeeId,
              category: 'Corporate Card',
              amount: amountMajor,
              currency: card.currency,
              description,
              status: 'PENDING',
              receiptUrl: null,
            },
          });

          this.eventEmitter.emit(
            BANKING_EVENTS.CORPORATE_CARD_TRANSACTION_MATCHED,
            {
              organizationId: card.organizationId,
              cardId: card.id,
              expenseId: expense.id,
              employeeId: card.employeeId,
              amountMajor,
            },
          );

          this.logger.log(
            `Card transaction matched for card ${card.id}. Auto-created expense claim ${expense.id}`,
          );

          return {
            received: true,
            event,
            autoCreatedExpenseId: expense.id,
          };
        }
      }
    }

    return { received: true, event };
  }
}
