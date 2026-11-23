import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('BillingController', () => {
  let controller: BillingController;
  let billingServiceMock: {
    getStatus: jest.Mock;
    requireOrgId: jest.Mock;
  };
  let subscriptionsMock: {
    resume: jest.Mock;
  };
  let invoicesMock: {
    generatePdf: jest.Mock;
  };

  beforeEach(async () => {
    billingServiceMock = {
      getStatus: jest.fn(),
      requireOrgId: jest.fn().mockReturnValue('org-123'),
    };
    subscriptionsMock = {
      resume: jest.fn(),
    };
    invoicesMock = {
      generatePdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: billingServiceMock,
        },
        { provide: SubscriptionsService, useValue: subscriptionsMock },
        { provide: InvoicesService, useValue: invoicesMock },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call billingService.getStatus', async () => {
    const mockUser: AuthenticatedUser = {
      id: 'usr-1',
      name: 'Test Owner',
      email: 'a@b.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_OWNER,
      organizationId: 'org-123',
    };
    billingServiceMock.getStatus.mockResolvedValue({ status: 'FREE' });

    const result = await controller.getStatus(mockUser);

    expect(billingServiceMock.getStatus).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual({ status: 'FREE' });
  });

  it('should call subscriptions.resume', async () => {
    const mockUser: AuthenticatedUser = {
      id: 'usr-1',
      name: 'Test Owner',
      email: 'a@b.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_OWNER,
      organizationId: 'org-123',
    };
    subscriptionsMock.resume.mockResolvedValue({
      cancelAtPeriodEnd: false,
      effectiveAt: '2026-12-01T00:00:00.000Z',
    });

    const result = await controller.resume(mockUser);

    expect(subscriptionsMock.resume).toHaveBeenCalledWith('org-123');
    expect(result).toEqual({
      cancelAtPeriodEnd: false,
      effectiveAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('should stream invoice PDF with attachment headers', async () => {
    const mockUser: AuthenticatedUser = {
      id: 'usr-1',
      name: 'Test Owner',
      email: 'a@b.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_OWNER,
      organizationId: 'org-123',
    };
    const pdfBuffer = Buffer.from('%PDF-1.3 fake');
    invoicesMock.generatePdf.mockResolvedValue({
      filename: 'INV-20261118-ABC123.pdf',
      buffer: pdfBuffer,
    });
    const setHeader = jest.fn();
    const end = jest.fn();
    const resMock = {
      setHeader,
      end,
    } as unknown as Response;

    await controller.downloadInvoicePdf(mockUser, 'inv-1', resMock);

    expect(invoicesMock.generatePdf).toHaveBeenCalledWith('org-123', 'inv-1');
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="INV-20261118-ABC123.pdf"',
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Length', pdfBuffer.length);
    expect(end).toHaveBeenCalledWith(pdfBuffer);
  });
});
