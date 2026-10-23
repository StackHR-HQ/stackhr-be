import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { BankingService } from './banking.service';
import { AnchorClient } from './anchor/anchor.client';
import { MOCK_NIGERIAN_BANKS } from './anchor/anchor.fixtures';

describe('BankingService', () => {
  let service: BankingService;
  let anchorClientMock: {
    getBanks: jest.Mock;
    verifyAccount: jest.Mock;
    createDepositAccount: jest.Mock;
    getAccountBalance: jest.Mock;
    initiateBulkTransfer: jest.Mock;
    initiateSingleTransfer: jest.Mock;
    issueCard: jest.Mock;
    getCard: jest.Mock;
    freezeCard: jest.Mock;
    unfreezeCard: jest.Mock;
    updateCardLimit: jest.Mock;
  };

  let prismaMock: {
    organizationDepositAccount: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    organization: {
      findUnique: jest.Mock;
    };
    payrollRun: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    salaryAdvance: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    reimbursement: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    corporateCard: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    employee: {
      findFirst: jest.Mock;
    };
    expense: {
      create: jest.Mock;
    };
    auditEvent: {
      create: jest.Mock;
    };
  };

  let eventEmitterMock: {
    emit: jest.Mock;
  };

  beforeEach(async () => {
    anchorClientMock = {
      getBanks: jest.fn(),
      verifyAccount: jest.fn(),
      createDepositAccount: jest.fn(),
      getAccountBalance: jest.fn(),
      initiateBulkTransfer: jest.fn(),
      initiateSingleTransfer: jest.fn(),
      issueCard: jest.fn(),
      getCard: jest.fn(),
      freezeCard: jest.fn(),
      unfreezeCard: jest.fn(),
      updateCardLimit: jest.fn(),
    };

    prismaMock = {
      organizationDepositAccount: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
      payrollRun: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      salaryAdvance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      reimbursement: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      corporateCard: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
      },
      expense: {
        create: jest.fn(),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankingService,
        {
          provide: AnchorClient,
          useValue: anchorClientMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
      ],
    }).compile();

    service = module.get<BankingService>(BankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBanks', () => {
    it('should query anchorClient.getBanks and cache the result', async () => {
      const mockBanks = MOCK_NIGERIAN_BANKS.map((b) => ({
        id: b.id,
        name: b.attributes.name,
        nipCode: b.attributes.nipCode,
        cbnCode: b.attributes.cbnCode,
      }));
      anchorClientMock.getBanks.mockResolvedValue(mockBanks);

      const firstCall = await service.getBanks();
      expect(firstCall).toEqual(mockBanks);
      expect(anchorClientMock.getBanks).toHaveBeenCalledTimes(1);

      // Second call should return cached data without calling anchorClient again
      const secondCall = await service.getBanks();
      expect(secondCall).toEqual(mockBanks);
      expect(anchorClientMock.getBanks).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyAccount', () => {
    it('should delegate account verification to anchorClient', async () => {
      const mockVerified = {
        accountNumber: '0123456789',
        accountName: 'CHUKWUEMEKA TEST',
        bankCode: '000014',
        bankName: 'ACCESS BANK',
      };
      anchorClientMock.verifyAccount.mockResolvedValue(mockVerified);

      const result = await service.verifyAccount({
        bankCode: '000014',
        accountNumber: '0123456789',
      });

      expect(anchorClientMock.verifyAccount).toHaveBeenCalledWith(
        '000014',
        '0123456789',
      );
      expect(result).toEqual(mockVerified);
    });
  });

  describe('getDepositAccount', () => {
    it('should return existing account if already created', async () => {
      const mockAccount = {
        id: 'acc-1',
        organizationId: 'org-1',
        anchorAccountId: 'anchor-acc-1',
        accountNumber: '9912345678',
        accountName: 'StackHR - Acme Corp',
        bankName: 'PROVIDUS BANK',
        nipCode: '000023',
        currency: 'NGN',
        balanceKobo: BigInt(50000000),
        status: 'ACTIVE',
      };
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue(
        mockAccount,
      );

      const result = await service.getDepositAccount('org-1');
      expect(result).toEqual(mockAccount);
      expect(anchorClientMock.createDepositAccount).not.toHaveBeenCalled();
    });

    it('should auto-provision a deposit account on Anchor if not yet created', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue(null);
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
      });
      anchorClientMock.createDepositAccount.mockResolvedValue({
        anchorAccountId: 'anchor-acc-new',
        accountNumber: '9998887776',
        accountName: 'StackHR - Acme Corp',
        bankName: 'PROVIDUS BANK',
        nipCode: '000023',
        currency: 'NGN',
        balanceKobo: 0,
      });
      const createdRecord = {
        id: 'acc-new',
        organizationId: 'org-1',
        anchorAccountId: 'anchor-acc-new',
        accountNumber: '9998887776',
        accountName: 'StackHR - Acme Corp',
        bankName: 'PROVIDUS BANK',
        nipCode: '000023',
        currency: 'NGN',
        balanceKobo: BigInt(0),
        status: 'ACTIVE',
      };
      prismaMock.organizationDepositAccount.create.mockResolvedValue(
        createdRecord,
      );

      const result = await service.getDepositAccount('org-1');

      expect(anchorClientMock.createDepositAccount).toHaveBeenCalledWith(
        'Acme Corp',
      );
      expect(prismaMock.organizationDepositAccount.create).toHaveBeenCalledWith(
        {
          data: {
            organizationId: 'org-1',
            anchorAccountId: 'anchor-acc-new',
            accountNumber: '9998887776',
            accountName: 'StackHR - Acme Corp',
            bankName: 'PROVIDUS BANK',
            nipCode: '000023',
            currency: 'NGN',
            balanceKobo: BigInt(0),
            status: 'ACTIVE',
          },
        },
      );
      expect(result).toEqual(createdRecord);
    });

    it('should throw NotFoundException if organization does not exist', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue(null);
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(service.getDepositAccount('org-unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('syncDepositAccountBalance', () => {
    it('should fetch balance from Anchor and update deposit account', async () => {
      const mockAccount = {
        id: 'acc-1',
        organizationId: 'org-1',
        anchorAccountId: 'anchor-acc-1',
      };
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue(
        mockAccount,
      );
      anchorClientMock.getAccountBalance.mockResolvedValue({
        availableBalanceKobo: 75000000,
        ledgerBalanceKobo: 75000000,
        currency: 'NGN',
      });
      const updatedAccount = {
        ...mockAccount,
        balanceKobo: BigInt(75000000),
      };
      prismaMock.organizationDepositAccount.update.mockResolvedValue(
        updatedAccount,
      );

      const result = await service.syncDepositAccountBalance('org-1');

      expect(anchorClientMock.getAccountBalance).toHaveBeenCalledWith(
        'anchor-acc-1',
      );
      expect(prismaMock.organizationDepositAccount.update).toHaveBeenCalledWith(
        {
          where: { id: 'acc-1' },
          data: { balanceKobo: BigInt(75000000) },
        },
      );
      expect(result).toEqual(updatedAccount);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should credit deposit account and emit event on deposit.successful', async () => {
      const existing = {
        id: 'acc-1',
        organizationId: 'org-1',
        balanceKobo: BigInt(100000),
      };
      prismaMock.organizationDepositAccount.findFirst.mockResolvedValue(
        existing,
      );
      prismaMock.organizationDepositAccount.update.mockResolvedValue({
        ...existing,
        balanceKobo: BigInt(600000),
      });

      const payload = {
        event: 'deposit.successful',
        data: {
          id: 'txn_123',
          type: 'Transaction',
          attributes: {
            amount: 500000,
            currency: 'NGN',
            reference: 'ref_12345',
            status: 'SUCCESSFUL',
            accountId: 'anchor-acc-1',
          },
        },
      };

      const result = await service.handleWebhookEvent(payload);

      expect(prismaMock.organizationDepositAccount.update).toHaveBeenCalledWith(
        {
          where: { id: 'acc-1' },
          data: {
            balanceKobo: { increment: BigInt(500000) },
          },
        },
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'anchor.deposit.successful',
        expect.objectContaining({
          organizationId: 'org-1',
          amountKobo: 500000,
          reference: 'ref_12345',
        }),
      );
      expect(result).toEqual({
        received: true,
        event: 'deposit.successful',
        organizationId: 'org-1',
        newBalanceKobo: 600000,
      });
    });

    it('should auto-reconcile payroll run on transfer.successful for pyr_ reference', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue({
        id: 'run-123',
        organizationId: 'org-1',
        title: 'October 2026 Payroll',
        status: 'EXECUTED',
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-123',
        status: 'RECONCILED',
      });

      const payload = {
        event: 'transfer.successful',
        data: {
          id: 'txn_trn_1',
          type: 'Transaction',
          attributes: {
            reference: 'pyr_run-123_emp-1_1',
            status: 'SUCCESSFUL',
          },
        },
      };

      const result = await service.handleWebhookEvent(payload);

      expect(prismaMock.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-123' },
          data: expect.objectContaining({ status: 'RECONCILED' }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'payroll_run.reconciled',
        expect.objectContaining({
          payrollRunId: 'run-123',
          reference: 'pyr_run-123_emp-1_1',
        }),
      );
      expect(result).toEqual({
        received: true,
        event: 'transfer.successful',
        reconciledRunId: 'run-123',
      });
    });

    it('should auto-disburse salary advance on transfer.successful for adv_ reference', async () => {
      prismaMock.salaryAdvance.findUnique.mockResolvedValue({
        id: 'adv-456',
        organizationId: 'org-1',
        amount: 250000,
        status: 'APPROVED',
      });
      prismaMock.salaryAdvance.update.mockResolvedValue({
        id: 'adv-456',
        status: 'DISBURSED',
      });

      const payload = {
        event: 'transfer.successful',
        data: {
          id: 'txn_trn_adv',
          type: 'Transaction',
          attributes: {
            reference: 'adv_adv-456_1',
            status: 'SUCCESSFUL',
          },
        },
      };

      const result = await service.handleWebhookEvent(payload);

      expect(prismaMock.salaryAdvance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'adv-456' },
          data: expect.objectContaining({ status: 'DISBURSED' }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'salary_advance.disbursed',
        expect.objectContaining({
          advanceId: 'adv-456',
          reference: 'adv_adv-456_1',
        }),
      );
      expect(result).toEqual({
        received: true,
        event: 'transfer.successful',
        disbursedAdvanceId: 'adv-456',
      });
    });

    it('should auto-pay reimbursement on transfer.successful for rem_ reference', async () => {
      prismaMock.reimbursement.findUnique.mockResolvedValue({
        id: 'rem-789',
        organizationId: 'org-1',
        amount: 75000,
        currency: 'NGN',
        status: 'PENDING',
      });
      prismaMock.reimbursement.update.mockResolvedValue({
        id: 'rem-789',
        status: 'PAID',
      });

      const payload = {
        event: 'transfer.successful',
        data: {
          id: 'txn_trn_rem',
          type: 'Transaction',
          attributes: {
            reference: 'rem_rem-789_1',
            status: 'SUCCESSFUL',
          },
        },
      };

      const result = await service.handleWebhookEvent(payload);

      expect(prismaMock.reimbursement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rem-789' },
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'reimbursement.paid',
        expect.objectContaining({
          reimbursementId: 'rem-789',
          reference: 'rem_rem-789_1',
        }),
      );
      expect(result).toEqual({
        received: true,
        event: 'transfer.successful',
        paidReimbursementId: 'rem-789',
      });
    });
  });

  describe('executePayrollTransfers', () => {
    it('should throw BadRequestException if deposit account has insufficient funds', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        anchorAccountId: 'anc-1',
        balanceKobo: BigInt(50000), // 500 NGN
      });

      const transfers = [
        {
          amountKobo: 100000, // 1000 NGN
          reference: 'pyr_run-1_emp-1_1',
          destination: {
            accountNumber: '0123456789',
            bankCode: '000014',
            accountName: 'John Doe',
          },
        },
      ];

      await expect(
        service.executePayrollTransfers('org-1', 'run-1', transfers),
      ).rejects.toThrow('Insufficient balance in organization deposit account');
    });

    it('should submit bulk transfer via Anchor and deduct local ledger', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        anchorAccountId: 'anc-1',
        balanceKobo: BigInt(10000000),
      });

      const transfers = [
        {
          amountKobo: 500000,
          reference: 'pyr_run-1_emp-1_1',
          destination: {
            accountNumber: '0123456789',
            bankCode: '000014',
            accountName: 'John Doe',
          },
        },
      ];

      anchorClientMock.initiateBulkTransfer.mockResolvedValue({
        id: 'blk_123',
        reference: 'blk_ref_123',
        status: 'PROCESSING',
        transfersCount: 1,
        totalAmountKobo: 500000,
      });

      const result = await service.executePayrollTransfers(
        'org-1',
        'run-1',
        transfers,
      );

      expect(anchorClientMock.initiateBulkTransfer).toHaveBeenCalledWith({
        sourceAccountId: 'anc-1',
        transfers,
      });
      expect(prismaMock.organizationDepositAccount.update).toHaveBeenCalledWith(
        {
          where: { id: 'acc-1' },
          data: {
            balanceKobo: { decrement: BigInt(500000) },
          },
        },
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'anchor.payroll_transfers.initiated',
        expect.objectContaining({
          organizationId: 'org-1',
          runId: 'run-1',
          totalAmountKobo: 500000,
        }),
      );
      expect(result.id).toBe('blk_123');
    });
  });

  describe('executeSingleTransfer', () => {
    it('should throw BadRequestException if deposit account has insufficient funds', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        anchorAccountId: 'anc-1',
        balanceKobo: BigInt(10000), // 100 NGN
      });

      await expect(
        service.executeSingleTransfer('org-1', {
          amountKobo: 500000, // 5000 NGN
          reference: 'adv_adv1_1',
          destination: {
            accountNumber: '0123456789',
            bankCode: '000014',
            accountName: 'John Doe',
          },
        }),
      ).rejects.toThrow('Insufficient balance in organization deposit account');
    });

    it('should submit single transfer via Anchor and deduct local ledger', async () => {
      prismaMock.organizationDepositAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        anchorAccountId: 'anc-1',
        balanceKobo: BigInt(10000000), // 100,000 NGN
      });

      anchorClientMock.initiateSingleTransfer.mockResolvedValue({
        id: 'trf_123',
        reference: 'adv_adv1_1',
        status: 'PROCESSING',
        amountKobo: 2500000,
        currency: 'NGN',
        feeKobo: 1075,
      });

      const result = await service.executeSingleTransfer('org-1', {
        amountKobo: 2500000,
        reference: 'adv_adv1_1',
        destination: {
          accountNumber: '0123456789',
          bankCode: '000014',
          accountName: 'John Doe',
        },
        reason: 'Salary Advance Payout',
      });

      expect(anchorClientMock.initiateSingleTransfer).toHaveBeenCalledWith({
        sourceAccountId: 'anc-1',
        amountKobo: 2500000,
        currency: 'NGN',
        reference: 'adv_adv1_1',
        destination: {
          accountNumber: '0123456789',
          bankCode: '000014',
          accountName: 'John Doe',
        },
        reason: 'Salary Advance Payout',
      });
      expect(prismaMock.organizationDepositAccount.update).toHaveBeenCalledWith(
        {
          where: { id: 'acc-1' },
          data: {
            balanceKobo: { decrement: BigInt(2500000) },
          },
        },
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'anchor.single_transfer.initiated',
        expect.objectContaining({
          organizationId: 'org-1',
          amountKobo: 2500000,
          reference: 'adv_adv1_1',
        }),
      );
      expect(result.id).toBe('trf_123');
    });
  });

  describe('Corporate Cards Management', () => {
    it('should issue a corporate card via Anchor and save in DB', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        fullName: 'Jane Doe',
        email: 'jane@acme.com',
      });
      anchorClientMock.issueCard.mockResolvedValue({
        id: 'crd_anchor_1',
        cardName: 'Jane Doe',
        maskedPan: '5399 **** **** 1234',
        expiryMonth: '12',
        expiryYear: '28',
        brand: 'MASTERCARD',
        currency: 'NGN',
        status: 'ACTIVE',
        spendingLimitKobo: 50000000,
        spendingInterval: 'MONTHLY',
      });
      prismaMock.corporateCard.create.mockResolvedValue({
        id: 'card-1',
        anchorCardId: 'crd_anchor_1',
        cardName: 'Jane Doe',
        maskedPan: '5399 **** **** 1234',
        status: 'ACTIVE',
      });

      const result = await service.issueCorporateCard('org-1', {
        employeeId: 'emp-1',
        spendingLimitKobo: 50000000,
      });

      expect(anchorClientMock.issueCard).toHaveBeenCalled();
      expect(prismaMock.corporateCard.create).toHaveBeenCalled();
      expect(result.card.id).toBe('card-1');
    });

    it('should throw NotFoundException if employee not found when issuing card', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.issueCorporateCard('org-1', {
          employeeId: 'invalid-emp',
          spendingLimitKobo: 50000000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return corporate cards for organization', async () => {
      prismaMock.corporateCard.findMany.mockResolvedValue([{ id: 'card-1' }]);

      const result = await service.getCorporateCards('org-1');
      expect(prismaMock.corporateCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.cards).toHaveLength(1);
    });

    it('should freeze corporate card and update status in DB', async () => {
      prismaMock.corporateCard.findFirst.mockResolvedValue({
        id: 'card-1',
        anchorCardId: 'crd_anchor_1',
        status: 'ACTIVE',
      });
      prismaMock.corporateCard.update.mockResolvedValue({
        id: 'card-1',
        status: 'FROZEN',
      });

      const result = await service.toggleCardFreeze('org-1', 'card-1', {
        action: 'FREEZE',
      });
      expect(anchorClientMock.freezeCard).toHaveBeenCalledWith('crd_anchor_1');
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'corporate_card.frozen',
        expect.objectContaining({
          cardId: 'card-1',
          anchorCardId: 'crd_anchor_1',
        }),
      );
      expect(result.card.status).toBe('FROZEN');
    });

    it('should update card spending limit via Anchor and DB', async () => {
      prismaMock.corporateCard.findFirst.mockResolvedValue({
        id: 'card-1',
        anchorCardId: 'crd_anchor_1',
        spendingLimitKobo: 10000000,
        spendingInterval: 'MONTHLY',
      });
      prismaMock.corporateCard.update.mockResolvedValue({
        id: 'card-1',
        spendingLimitKobo: 25000000,
        spendingInterval: 'MONTHLY',
      });

      const result = await service.updateCardSpendingLimit('org-1', 'card-1', {
        spendingLimitKobo: 25000000,
      });

      expect(anchorClientMock.updateCardLimit).toHaveBeenCalledWith({
        cardId: 'crd_anchor_1',
        spendingLimitKobo: 25000000,
        spendingInterval: 'MONTHLY',
      });
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'corporate_card.limit_updated',
        expect.objectContaining({
          cardId: 'card-1',
          spendingLimitKobo: 25000000,
        }),
      );
      expect(result.card.spendingLimitKobo).toBe(25000000);
    });

    it('should auto-create pending expense claim on card.transaction.approved webhook', async () => {
      prismaMock.corporateCard.findFirst.mockResolvedValue({
        id: 'card-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        anchorCardId: 'crd_anchor_1',
        currency: 'NGN',
      });
      prismaMock.expense.create.mockResolvedValue({
        id: 'exp-auto-1',
        amount: 25000,
        status: 'PENDING',
      });

      const payload = {
        event: 'card.transaction.approved',
        data: {
          id: 'crd_anchor_1',
          type: 'CardTransaction',
          attributes: {
            cardId: 'crd_anchor_1',
            amount: 2500000, // 25,000 NGN in kobo
            currency: 'NGN',
            merchantName: 'Uber Nigeria',
          },
        },
      };

      const result = await service.handleWebhookEvent(payload);

      expect(prismaMock.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            employeeId: 'emp-1',
            category: 'Corporate Card',
            amount: 25000,
            status: 'PENDING',
          }),
        }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'corporate_card.transaction.matched',
        expect.objectContaining({
          cardId: 'card-1',
          amountMajor: 25000,
        }),
      );
      expect(result.autoCreatedExpenseId).toBe('exp-auto-1');
    });
  });
});
