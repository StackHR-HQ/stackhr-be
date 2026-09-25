import { Test, TestingModule } from '@nestjs/testing';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let serviceMock: {
    createInvitation: jest.Mock;
    findAll: jest.Mock;
    getInvitationDetails: jest.Mock;
    acceptInvitation: jest.Mock;
    revokeInvitation: jest.Mock;
    resendInvitation: jest.Mock;
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
    serviceMock = {
      createInvitation: jest.fn(),
      findAll: jest.fn(),
      getInvitationDetails: jest.fn(),
      acceptInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      resendInvitation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [
        {
          provide: InvitationsService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvitationsController>(InvitationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate createInvitation to service', async () => {
    const dto = { email: 'new@acme.com', role: 'EMPLOYEE' };
    serviceMock.createInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
    });

    const result = await controller.createInvitation(mockAdminUser, dto);

    expect(serviceMock.createInvitation).toHaveBeenCalledWith(
      mockAdminUser,
      dto,
    );
    expect(result.invitation.id).toBe('inv-1');
  });

  it('should delegate findAll to service', async () => {
    serviceMock.findAll.mockResolvedValue({ invitations: [] });

    const result = await controller.findAll(mockAdminUser);

    expect(serviceMock.findAll).toHaveBeenCalledWith(mockAdminUser);
    expect(result.invitations).toEqual([]);
  });

  it('should delegate getInvitationDetails to service', async () => {
    serviceMock.getInvitationDetails.mockResolvedValue({
      invitation: { id: 'inv-1' },
    });

    const result = await controller.getInvitationDetails('inv-1');

    expect(serviceMock.getInvitationDetails).toHaveBeenCalledWith('inv-1');
    expect(result.invitation.id).toBe('inv-1');
  });

  it('should delegate acceptInvitation to service', async () => {
    const dto = { fullName: 'New User', password: 'Password123!' };
    serviceMock.acceptInvitation.mockResolvedValue({ message: 'Accepted' });

    const result = await controller.acceptInvitation('inv-1', dto);

    expect(serviceMock.acceptInvitation).toHaveBeenCalledWith('inv-1', dto);
    expect(result.message).toBe('Accepted');
  });

  it('should delegate revokeInvitation to service', async () => {
    serviceMock.revokeInvitation.mockResolvedValue({ message: 'Revoked' });

    const result = await controller.revokeInvitation(mockAdminUser, 'inv-1');

    expect(serviceMock.revokeInvitation).toHaveBeenCalledWith(
      mockAdminUser,
      'inv-1',
    );
    expect(result.message).toBe('Revoked');
  });

  it('should delegate resendInvitation to service', async () => {
    serviceMock.resendInvitation.mockResolvedValue({ message: 'Resent' });

    const result = await controller.resendInvitation(mockAdminUser, 'inv-1');

    expect(serviceMock.resendInvitation).toHaveBeenCalledWith(
      mockAdminUser,
      'inv-1',
    );
    expect(result.message).toBe('Resent');
  });
});
