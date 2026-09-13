import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('OnboardingService — Templates & Checklists', () => {
  let service: OnboardingService;
  let prismaMock: {
    organization: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    employee: {
      findFirst: jest.Mock;
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
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('getTemplates', () => {
    it('should return default department templates if metadata is empty', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        metadata: null,
      });

      const result = await service.getTemplates(mockAdminUser);

      expect(result.templates.length).toBeGreaterThan(0);
      expect(result.templates[0].department).toBe('General');
    });

    it('should return custom templates from organization metadata', async () => {
      const customTemplates = [
        {
          department: 'Design',
          title: 'Design Onboarding',
          tasks: [{ id: 't1', title: 'Figma license setup', required: true }],
        },
      ];
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        metadata: JSON.stringify({ onboardingTemplates: customTemplates }),
      });

      const result = await service.getTemplates(mockAdminUser);

      expect(result.templates).toEqual(customTemplates);
    });
  });

  describe('saveTemplate', () => {
    it('should save/update a department onboarding template', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        metadata: null,
      });
      prismaMock.organization.update.mockResolvedValue({ id: 'org-123' });

      const dto = {
        department: 'Engineering',
        title: 'Tech Onboarding',
        tasks: [{ title: 'Setup Mac', required: true }],
      };

      const result = await service.saveTemplate(mockAdminUser, dto);

      expect(result.message).toBe('Onboarding template saved successfully');
      expect(result.template.department).toBe('Engineering');
      expect(prismaMock.organization.update).toHaveBeenCalled();
    });
  });

  describe('getEmployeeChecklist', () => {
    it('should generate employee onboarding checklist based on department template', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        fullName: 'Alice Dev',
        department: 'Engineering',
      });
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        metadata: null,
      });

      const result = await service.getEmployeeChecklist(mockAdminUser, 'emp-1');

      expect(result.employeeId).toBe('emp-1');
      expect(result.checklist.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException if employee not found', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.getEmployeeChecklist(mockAdminUser, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateChecklistTask', () => {
    it('should toggle task completion status', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        fullName: 'Alice Dev',
        department: 'General',
      });
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        metadata: null,
      });

      const result = await service.updateChecklistTask(
        mockAdminUser,
        'emp-1',
        'task-1',
        true,
      );

      expect(result.task.completed).toBe(true);
      expect(result.task.completedAt).not.toBeNull();
    });
  });
});
