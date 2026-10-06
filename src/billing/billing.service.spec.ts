import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('BillingService', () => {
  let service: BillingService;
  let prismaMock: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin Owner',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
      },
      employee: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('getStatus', () => {
    it('should return trialing billing status if org created recently', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        createdAt: new Date(),
      });
      prismaMock.employee.count.mockResolvedValue(12);

      const result = await service.getStatus(mockUser);

      expect(result.status).toBe('TRIALING');
      expect(result.trialStartedAt).toBeDefined();
      expect(result.trialLengthDays).toBe(30);
      expect(result.activeEmployeeCount).toBe(12);
      expect(result.seatLimit).toBe(50);
    });

    it('should throw NotFoundException if org does not exist', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
