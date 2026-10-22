import { Test, TestingModule } from '@nestjs/testing';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('LeaveController', () => {
  let controller: LeaveController;
  let serviceMock: {
    createLeaveType: jest.Mock;
    updateLeaveType: jest.Mock;
    deleteLeaveType: jest.Mock;
    getLeaveTypes: jest.Mock;
    getLeaveBalances: jest.Mock;
    submitLeaveRequest: jest.Mock;
    getLeaveHistory: jest.Mock;
    getLeaveRequestDetails: jest.Mock;
    cancelLeaveRequest: jest.Mock;
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin Owner',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    serviceMock = {
      createLeaveType: jest.fn(),
      updateLeaveType: jest.fn(),
      deleteLeaveType: jest.fn(),
      getLeaveTypes: jest.fn(),
      getLeaveBalances: jest.fn(),
      submitLeaveRequest: jest.fn(),
      getLeaveHistory: jest.fn(),
      getLeaveRequestDetails: jest.fn(),
      cancelLeaveRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [
        {
          provide: LeaveService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeaveController>(LeaveController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate createLeaveType to service', async () => {
    const dto = { name: 'Annual Leave', daysPerYear: 20 };
    serviceMock.createLeaveType.mockResolvedValue({
      leaveType: { id: 'lt-1' },
    });

    const result = await controller.createLeaveType(mockAdminUser, dto);

    expect(serviceMock.createLeaveType).toHaveBeenCalledWith(
      mockAdminUser,
      dto,
    );
    expect(result.leaveType.id).toBe('lt-1');
  });

  it('should delegate getLeaveTypes to service', async () => {
    serviceMock.getLeaveTypes.mockResolvedValue({ leaveTypes: [] });

    const result = await controller.getLeaveTypes(mockAdminUser);

    expect(serviceMock.getLeaveTypes).toHaveBeenCalledWith(mockAdminUser);
    expect(result.leaveTypes).toEqual([]);
  });

  it('should delegate getLeaveBalances to service', async () => {
    serviceMock.getLeaveBalances.mockResolvedValue({ balances: [] });

    const result = await controller.getLeaveBalances(mockAdminUser);

    expect(serviceMock.getLeaveBalances).toHaveBeenCalledWith(mockAdminUser);
    expect(result.balances).toEqual([]);
  });

  it('should delegate getLeaveHistory to service', async () => {
    const query = { page: 1, limit: 10 };
    serviceMock.getLeaveHistory.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });

    const result = await controller.getLeaveHistory(mockAdminUser, query);

    expect(serviceMock.getLeaveHistory).toHaveBeenCalledWith(
      mockAdminUser,
      query,
    );
    expect(result.data).toEqual([]);
  });

  it('should delegate submitLeaveRequest to service', async () => {
    const dto = {
      leaveTypeId: 'lt-1',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    };
    serviceMock.submitLeaveRequest.mockResolvedValue({ message: 'Submitted' });

    const result = await controller.submitLeaveRequest(mockAdminUser, dto);

    expect(serviceMock.submitLeaveRequest).toHaveBeenCalledWith(
      mockAdminUser,
      dto,
    );
    expect(result.message).toBe('Submitted');
  });

  it('should delegate getLeaveRequestDetails to service', async () => {
    serviceMock.getLeaveRequestDetails.mockResolvedValue({
      leaveRequest: { id: 'lr-1' },
    });

    const result = await controller.getLeaveRequestDetails(
      mockAdminUser,
      'lr-1',
    );

    expect(serviceMock.getLeaveRequestDetails).toHaveBeenCalledWith(
      mockAdminUser,
      'lr-1',
    );
    expect(result.leaveRequest.id).toBe('lr-1');
  });

  it('should delegate updateLeaveType to service', async () => {
    const dto = { daysPerYear: 15 };
    serviceMock.updateLeaveType.mockResolvedValue({
      leaveType: { id: 'lt-1', daysPerYear: 15 },
    });

    const result = await controller.updateLeaveType(mockAdminUser, 'lt-1', dto);

    expect(serviceMock.updateLeaveType).toHaveBeenCalledWith(
      mockAdminUser,
      'lt-1',
      dto,
    );
    expect(result.leaveType.id).toBe('lt-1');
  });

  it('should delegate deleteLeaveType to service', async () => {
    serviceMock.deleteLeaveType.mockResolvedValue({
      message: 'Leave type deleted successfully',
    });

    const result = await controller.deleteLeaveType(mockAdminUser, 'lt-1');

    expect(serviceMock.deleteLeaveType).toHaveBeenCalledWith(
      mockAdminUser,
      'lt-1',
    );
    expect(result.message).toBe('Leave type deleted successfully');
  });

  it('should delegate cancelLeaveRequest to service', async () => {
    serviceMock.cancelLeaveRequest.mockResolvedValue({
      leaveRequest: { id: 'lr-1', status: 'CANCELLED' },
    });

    const result = await controller.cancelLeaveRequest(mockAdminUser, 'lr-1');

    expect(serviceMock.cancelLeaveRequest).toHaveBeenCalledWith(
      mockAdminUser,
      'lr-1',
    );
    expect(result.leaveRequest.id).toBe('lr-1');
  });
});
