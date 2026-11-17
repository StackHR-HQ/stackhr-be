import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { BachsClient } from './bachs/bachs.client';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prismaMock: {
    billingInvoice: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      billingInvoice: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BachsClient, useValue: {} },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  describe('generatePdf', () => {
    it('generates a valid PDF buffer for an organization invoice', async () => {
      prismaMock.billingInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        number: 'INV-20261118-ABC123',
        kind: 'INITIAL',
        status: 'PAID',
        periodStart: new Date('2026-11-01T00:00:00.000Z'),
        periodEnd: new Date('2026-12-01T00:00:00.000Z'),
        dueAt: new Date('2026-11-01T00:00:00.000Z'),
        paidAt: new Date('2026-11-01T00:05:00.000Z'),
        subtotalKobo: 2000000n,
        totalKobo: 2000000n,
        lines: [
          {
            code: 'BASE',
            description: 'Growth Plan (Monthly)',
            quantity: 1,
            unitAmountKobo: '2000000',
            amountKobo: '2000000',
          },
        ],
        organization: { name: 'Acme Corp', taxId: 'TIN-12345' },
        subscription: { planCode: 'GROWTH', billingCycle: 'MONTHLY' },
      });

      const result = await service.generatePdf('org-1', 'inv-1');

      expect(result.filename).toBe('INV-20261118-ABC123.pdf');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    });

    it('throws NotFoundException when invoice does not exist for org', async () => {
      prismaMock.billingInvoice.findFirst.mockResolvedValue(null);

      await expect(service.generatePdf('org-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
