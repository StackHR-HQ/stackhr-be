import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prismaMock: {
    employee: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
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
    prismaMock = {
      employee: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  describe('createEmployee', () => {
    it('should create an employee successfully', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);
      prismaMock.employee.create.mockResolvedValue({
        id: 'emp-1',
        organizationId: 'org-123',
        fullName: 'Jane Doe',
        email: 'jane@acme.com',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        employmentType: 'FULL_TIME',
        salaryAmount: 500000,
        startDate: new Date('2026-01-01'),
        managerId: null,
        status: 'ACTIVE',
      });

      const result = await service.createEmployee(mockUser, {
        fullName: 'Jane Doe',
        email: 'jane@acme.com',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        employmentType: 'FULL_TIME',
        salaryAmount: 500000,
        startDate: '2026-01-01',
      });

      expect(result.employee.fullName).toBe('Jane Doe');
      expect(prismaMock.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
            email: 'jane@acme.com',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should throw ConflictException if email exists', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-existing' });

      await expect(
        service.createEmployee(mockUser, {
          fullName: 'Jane Doe',
          email: 'jane@acme.com',
          department: 'Engineering',
          jobTitle: 'Software Engineer',
          employmentType: 'FULL_TIME',
          salaryAmount: 500000,
          startDate: '2026-01-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if manager does not exist', async () => {
      prismaMock.employee.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        service.createEmployee(mockUser, {
          fullName: 'Jane Doe',
          email: 'jane@acme.com',
          department: 'Engineering',
          jobTitle: 'Software Engineer',
          employmentType: 'FULL_TIME',
          salaryAmount: 500000,
          startDate: '2026-01-01',
          managerId: 'invalid-mgr',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if organization context is missing', async () => {
      const userNoOrg: AuthenticatedUser = {
        ...mockUser,
        organizationId: null,
      };

      await expect(
        service.createEmployee(userNoOrg, {
          fullName: 'Jane Doe',
          email: 'jane@acme.com',
          department: 'Engineering',
          jobTitle: 'Software Engineer',
          employmentType: 'FULL_TIME',
          salaryAmount: 500000,
          startDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of employees', async () => {
      const mockList = [
        { id: 'emp-1', fullName: 'Jane Doe', department: 'Engineering' },
      ];
      prismaMock.employee.findMany.mockResolvedValue(mockList);
      prismaMock.employee.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 10 });

      expect(result.data).toEqual(mockList);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by department, status, and search query', async () => {
      prismaMock.employee.findMany.mockResolvedValue([]);
      prismaMock.employee.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        department: 'Finance',
        status: 'ACTIVE',
        search: 'Jane',
      });

      expect(prismaMock.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: 'Finance',
            status: 'ACTIVE',
            OR: [
              { fullName: { contains: 'Jane', mode: 'insensitive' } },
              { email: { contains: 'Jane', mode: 'insensitive' } },
              { jobTitle: { contains: 'Jane', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return single employee with manager and directReports', async () => {
      const mockEmp = {
        id: 'emp-1',
        fullName: 'Jane Doe',
        manager: null,
        directReports: [],
      };
      prismaMock.employee.findFirst.mockResolvedValue(mockEmp);

      const result = await service.findOne(mockUser, 'emp-1');

      expect(result.employee).toEqual(mockEmp);
    });

    it('should throw NotFoundException if employee not found', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);

      await expect(service.findOne(mockUser, 'invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateEmployee', () => {
    it('should update employee fields successfully', async () => {
      const existing = {
        id: 'emp-1',
        email: 'jane@acme.com',
        fullName: 'Jane Doe',
      };
      prismaMock.employee.findFirst.mockResolvedValue(existing);
      prismaMock.employee.update.mockResolvedValue({
        ...existing,
        jobTitle: 'Senior Software Engineer',
      });

      const result = await service.updateEmployee(mockUser, 'emp-1', {
        jobTitle: 'Senior Software Engineer',
      });

      expect(result.employee.jobTitle).toBe('Senior Software Engineer');
    });

    it('should throw BadRequestException if setting self as manager', async () => {
      const existing = { id: 'emp-1', email: 'jane@acme.com' };
      prismaMock.employee.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateEmployee(mockUser, 'emp-1', { managerId: 'emp-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reassignManager', () => {
    it('should reassign manager successfully when no cycle exists', async () => {
      const emp = { id: 'emp-2', managerId: null };
      const manager = { id: 'emp-1', managerId: null };

      prismaMock.employee.findFirst
        .mockResolvedValueOnce(emp) // find employee
        .mockResolvedValueOnce(manager) // find manager
        .mockResolvedValueOnce({ managerId: null }); // cycle check

      prismaMock.employee.update.mockResolvedValue({
        ...emp,
        managerId: 'emp-1',
        manager: { id: 'emp-1', fullName: 'Manager One' },
      });

      const result = await service.reassignManager(mockUser, 'emp-2', {
        managerId: 'emp-1',
      });

      expect(result.employee.managerId).toBe('emp-1');
    });

    it('should throw BadRequestException on circular manager assignment', async () => {
      const emp = { id: 'emp-1', managerId: null };
      const targetManager = { id: 'emp-2', managerId: 'emp-1' }; // emp-2 reports to emp-1!

      prismaMock.employee.findFirst
        .mockResolvedValueOnce(emp) // find employee
        .mockResolvedValueOnce(targetManager) // find target manager
        .mockResolvedValueOnce({ managerId: 'emp-1' }); // cycle check finds emp-1!

      await expect(
        service.reassignManager(mockUser, 'emp-1', { managerId: 'emp-2' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHierarchyTree', () => {
    it('should return nested hierarchy tree starting from top-level employees', async () => {
      const allEmps = [
        {
          id: 'emp-1',
          fullName: 'CEO Boss',
          managerId: null,
          department: 'Executive',
        },
        {
          id: 'emp-2',
          fullName: 'Tech Lead',
          managerId: 'emp-1',
          department: 'Engineering',
        },
      ];
      prismaMock.employee.findMany.mockResolvedValue(allEmps);

      const result = await service.getHierarchyTree(mockUser);

      expect(result.organizationTree).toHaveLength(1);
      expect(result.organizationTree[0].id).toBe('emp-1');
      expect(result.organizationTree[0].directReports).toHaveLength(1);
      expect(result.organizationTree[0].directReports[0].id).toBe('emp-2');
    });
  });

  describe('getDepartmentSummary', () => {
    it('should return grouped summary of employees per department', async () => {
      const allEmps = [
        { id: 'emp-1', fullName: 'Alice', department: 'Engineering' },
        { id: 'emp-2', fullName: 'Bob', department: 'Engineering' },
        { id: 'emp-3', fullName: 'Charlie', department: 'Finance' },
      ];
      prismaMock.employee.findMany.mockResolvedValue(allEmps);

      const result = await service.getDepartmentSummary(mockUser);

      expect(result.totalDepartments).toBe(2);
      expect(result.totalEmployees).toBe(3);
      expect(result.departments).toEqual([
        {
          department: 'Engineering',
          count: 2,
          employees: [allEmps[0], allEmps[1]],
        },
        {
          department: 'Finance',
          count: 1,
          employees: [allEmps[2]],
        },
      ]);
    });
  });

  describe('offboardEmployee', () => {
    it('should set employee status to OFFBOARDED', async () => {
      const existing = { id: 'emp-1', status: 'ACTIVE' };
      prismaMock.employee.findFirst.mockResolvedValue(existing);
      prismaMock.employee.update.mockResolvedValue({
        ...existing,
        status: 'OFFBOARDED',
      });

      const result = await service.offboardEmployee(mockUser, 'emp-1', {
        reason: 'Career change',
      });

      expect(result.employee.status).toBe('OFFBOARDED');
      expect(result.offboardDetails.reason).toBe('Career change');
    });

    it('should throw BadRequestException if already offboarded', async () => {
      const existing = { id: 'emp-1', status: 'OFFBOARDED' };
      prismaMock.employee.findFirst.mockResolvedValue(existing);

      await expect(
        service.offboardEmployee(mockUser, 'emp-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
