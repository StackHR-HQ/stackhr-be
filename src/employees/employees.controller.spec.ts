import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('EmployeesController', () => {
  let controller: EmployeesController;
  let serviceMock: {
    createEmployee: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    updateEmployee: jest.Mock;
    offboardEmployee: jest.Mock;
    reassignManager: jest.Mock;
    getHierarchyTree: jest.Mock;
    getDepartmentSummary: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    serviceMock = {
      createEmployee: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateEmployee: jest.fn(),
      offboardEmployee: jest.fn(),
      reassignManager: jest.fn(),
      getHierarchyTree: jest.fn(),
      getDepartmentSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [
        {
          provide: EmployeesService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmployeesController>(EmployeesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate createEmployee to service', async () => {
    const dto = {
      fullName: 'Jane Doe',
      email: 'jane@acme.com',
      department: 'Engineering',
      jobTitle: 'Developer',
      employmentType: 'FULL_TIME',
      salaryAmount: 500000,
      startDate: '2026-01-01',
    };
    serviceMock.createEmployee.mockResolvedValue({
      employee: { id: 'emp-1', ...dto },
    });

    const result = await controller.createEmployee(mockUser, dto);

    expect(serviceMock.createEmployee).toHaveBeenCalledWith(mockUser, dto);
    expect(result.employee.id).toBe('emp-1');
  });

  it('should delegate findAll to service', async () => {
    const query = { page: 1, limit: 10 };
    serviceMock.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.findAll(mockUser, query);

    expect(serviceMock.findAll).toHaveBeenCalledWith(mockUser, query);
    expect(result.data).toEqual([]);
  });

  it('should delegate getHierarchyTree to service', async () => {
    serviceMock.getHierarchyTree.mockResolvedValue({ organizationTree: [] });

    const result = await controller.getHierarchyTree(mockUser);

    expect(serviceMock.getHierarchyTree).toHaveBeenCalledWith(mockUser);
    expect(result.organizationTree).toEqual([]);
  });

  it('should delegate getDepartmentSummary to service', async () => {
    serviceMock.getDepartmentSummary.mockResolvedValue({ departments: [] });

    const result = await controller.getDepartmentSummary(mockUser);

    expect(serviceMock.getDepartmentSummary).toHaveBeenCalledWith(mockUser);
    expect(result.departments).toEqual([]);
  });

  it('should delegate findOne to service', async () => {
    serviceMock.findOne.mockResolvedValue({ employee: { id: 'emp-1' } });

    const result = await controller.findOne(mockUser, 'emp-1');

    expect(serviceMock.findOne).toHaveBeenCalledWith(mockUser, 'emp-1');
    expect(result.employee.id).toBe('emp-1');
  });

  it('should delegate updateEmployee to service', async () => {
    const dto = { jobTitle: 'Lead Developer' };
    serviceMock.updateEmployee.mockResolvedValue({
      employee: { id: 'emp-1', ...dto },
    });

    const result = await controller.updateEmployee(mockUser, 'emp-1', dto);

    expect(serviceMock.updateEmployee).toHaveBeenCalledWith(
      mockUser,
      'emp-1',
      dto,
    );
    expect(result.employee.jobTitle).toBe('Lead Developer');
  });

  it('should delegate reassignManager to service', async () => {
    const dto = { managerId: 'emp-mgr-1' };
    serviceMock.reassignManager.mockResolvedValue({ message: 'Reassigned' });

    const result = await controller.reassignManager(mockUser, 'emp-1', dto);

    expect(serviceMock.reassignManager).toHaveBeenCalledWith(
      mockUser,
      'emp-1',
      dto,
    );
    expect(result.message).toBe('Reassigned');
  });

  it('should delegate offboardEmployee to service', async () => {
    const dto = { reason: 'Resigned' };
    serviceMock.offboardEmployee.mockResolvedValue({ message: 'Offboarded' });

    const result = await controller.offboardEmployee(mockUser, 'emp-1', dto);

    expect(serviceMock.offboardEmployee).toHaveBeenCalledWith(
      mockUser,
      'emp-1',
      dto,
    );
    expect(result.message).toBe('Offboarded');
  });
});
