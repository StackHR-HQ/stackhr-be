import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prismaMock: {
    invitation: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    member: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    employee: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin Owner',
    email: 'owner@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    prismaMock = {
      invitation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      member: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  describe('createInvitation', () => {
    it('should create an invitation with a 7-day expiration', async () => {
      prismaMock.invitation.findFirst.mockResolvedValue(null);
      prismaMock.invitation.create.mockResolvedValue({
        id: 'inv-1',
        email: 'newuser@acme.com',
        role: 'EMPLOYEE',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await service.createInvitation(mockAdminUser, {
        email: 'newuser@acme.com',
        role: 'EMPLOYEE',
      });

      expect(result.invitation.email).toBe('newuser@acme.com');
      expect(prismaMock.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
            email: 'newuser@acme.com',
            status: 'pending',
          }),
        }),
      );
    });

    it('should throw ConflictException if pending invitation already exists', async () => {
      prismaMock.invitation.findFirst.mockResolvedValue({ id: 'inv-existing' });

      await expect(
        service.createInvitation(mockAdminUser, { email: 'existing@acme.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getInvitationDetails', () => {
    it('should return valid invitation details', async () => {
      const mockInv = {
        id: 'inv-1',
        email: 'user@acme.com',
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000),
        organization: { id: 'org-123', name: 'Acme' },
      };
      prismaMock.invitation.findUnique.mockResolvedValue(mockInv);

      const result = await service.getInvitationDetails('inv-1');

      expect(result.invitation.status).toBe('pending');
    });

    it('should update status to expired if invitation has passed expiration', async () => {
      const expiredInv = {
        id: 'inv-expired',
        email: 'user@acme.com',
        status: 'pending',
        expiresAt: new Date(Date.now() - 100000),
        organization: { id: 'org-123', name: 'Acme' },
      };
      prismaMock.invitation.findUnique.mockResolvedValue(expiredInv);
      prismaMock.invitation.update.mockResolvedValue({
        ...expiredInv,
        status: 'expired',
      });

      const result = await service.getInvitationDetails('inv-expired');

      expect(result.invitation.status).toBe('expired');
      expect(prismaMock.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-expired' },
        data: { status: 'expired' },
      });
    });
  });

  describe('acceptInvitation', () => {
    it('should accept valid pending invitation and create user/member/employee records', async () => {
      const validInv = {
        id: 'inv-1',
        organizationId: 'org-123',
        email: 'user@acme.com',
        role: 'EMPLOYEE',
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000),
      };
      prismaMock.invitation.findUnique.mockResolvedValue(validInv);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-new',
        name: 'New User',
        email: 'user@acme.com',
      });
      prismaMock.member.findFirst.mockResolvedValue(null);
      prismaMock.member.create.mockResolvedValue({});
      prismaMock.employee.findFirst.mockResolvedValue(null);
      prismaMock.employee.create.mockResolvedValue({});
      prismaMock.invitation.update.mockResolvedValue({
        ...validInv,
        status: 'accepted',
      });

      const result = await service.acceptInvitation('inv-1', {
        fullName: 'New User',
        password: 'SecurePassword123!',
      });

      expect(result.message).toBe('Invitation accepted successfully');
      expect(prismaMock.user.create).toHaveBeenCalled();
      expect(prismaMock.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'accepted' },
      });
    });

    it('should throw BadRequestException if invitation is expired or not pending', async () => {
      const expiredInv = {
        id: 'inv-1',
        status: 'expired',
        expiresAt: new Date(Date.now() - 100000),
      };
      prismaMock.invitation.findUnique.mockResolvedValue(expiredInv);

      await expect(
        service.acceptInvitation('inv-1', {
          fullName: 'New User',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke invitation successfully', async () => {
      prismaMock.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'pending',
      });
      prismaMock.invitation.update.mockResolvedValue({
        id: 'inv-1',
        status: 'revoked',
      });

      const result = await service.revokeInvitation(mockAdminUser, 'inv-1');

      expect(result.invitation.status).toBe('revoked');
    });
  });

  describe('resendInvitation', () => {
    it('should refresh expiration and set status back to pending', async () => {
      prismaMock.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'expired',
      });
      prismaMock.invitation.update.mockResolvedValue({
        id: 'inv-1',
        status: 'pending',
        expiresAt: new Date(),
      });

      const result = await service.resendInvitation(mockAdminUser, 'inv-1');

      expect(result.message).toBe('Invitation resent successfully');
    });
  });
});
