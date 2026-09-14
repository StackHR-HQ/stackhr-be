import { ConflictException } from '@nestjs/common';
import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow, ORG_A, ORG_B } from '../testing/fixtures';
import { PeopleOnboardingService } from './people-onboarding.service';

describe('PeopleOnboardingService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let service: PeopleOnboardingService;

  beforeEach(() => {
    fake = createInMemoryTenant();
    service = new PeopleOnboardingService(fake.tenant);
    fake.seed('onboardingTemplate', [
      {
        id: 'tpl_eng',
        organizationId: ORG_A,
        name: 'Engineering onboarding',
        revision: 1,
      },
      {
        id: 'tpl_other',
        organizationId: ORG_B,
        name: 'Other org',
        revision: 1,
      },
    ]);
    fake.seed('onboardingTemplateDepartment', [
      { organizationId: ORG_A, templateId: 'tpl_eng', departmentId: 'dep_eng' },
    ]);
    fake.seed('onboardingChecklistItem', [
      {
        id: 'item_laptop',
        organizationId: ORG_A,
        templateId: 'tpl_eng',
        label: 'Issue laptop',
        stage: 'Before day one',
        position: 1,
      },
      {
        id: 'item_contract',
        organizationId: ORG_A,
        templateId: 'tpl_eng',
        label: 'Sign contract',
        stage: 'Before day one',
        position: 0,
      },
      {
        id: 'item_other',
        organizationId: ORG_B,
        templateId: 'tpl_other',
        label: 'Hidden',
        stage: 'Day one',
        position: 0,
      },
    ]);
  });

  describe('listTemplates', () => {
    it('returns caller organization templates with department defaults and ordered checklist', async () => {
      await expect(service.listTemplates(adminUser())).resolves.toEqual([
        {
          id: 'tpl_eng',
          name: 'Engineering onboarding',
          departmentIds: ['dep_eng'],
          checklist: [
            {
              id: 'item_contract',
              label: 'Sign contract',
              stage: 'Before day one',
            },
            {
              id: 'item_laptop',
              label: 'Issue laptop',
              stage: 'Before day one',
            },
          ],
        },
      ]);
    });
  });

  describe('listEmployees', () => {
    it('returns assigned onboarding and invited employees with their persisted progress', async () => {
      fake.seed('employee', [
        employeeRow({ status: 'ONBOARDING' }),
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
          status: 'ACTIVE',
        }),
        employeeRow({
          id: 'emp_cara',
          fullName: 'Cara Eze',
          email: 'cara@acme.test',
          status: 'PENDING_INVITATION',
        }),
        employeeRow({
          id: 'emp_other',
          organizationId: ORG_B,
          status: 'ONBOARDING',
        }),
      ]);
      fake.seed('employeeOnboarding', [
        { employeeId: 'emp_ada', organizationId: ORG_A, templateId: 'tpl_eng' },
        {
          employeeId: 'emp_bola',
          organizationId: ORG_A,
          templateId: 'tpl_eng',
        },
        {
          employeeId: 'emp_other',
          organizationId: ORG_B,
          templateId: 'tpl_other',
        },
      ]);
      fake.seed('onboardingItemCompletion', [
        {
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          itemId: 'item_contract',
          completedByUserId: 'user_admin',
        },
      ]);

      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        {
          employeeId: 'emp_ada',
          employeeName: 'Ada Okafor',
          avatarInitials: 'AO',
          jobTitle: 'Software Engineer',
          startDate: '2026-01-05',
          templateId: 'tpl_eng',
          completedItemIds: ['item_contract'],
        },
      ]);
    });
  });

  describe('assignTemplate', () => {
    it('assigns a template to an employee so their progress is tracked', async () => {
      fake.seed('employee', [employeeRow({ status: 'ONBOARDING' })]);
      const expectedRow = {
        employeeId: 'emp_ada',
        employeeName: 'Ada Okafor',
        avatarInitials: 'AO',
        jobTitle: 'Software Engineer',
        startDate: '2026-01-05',
        templateId: 'tpl_eng',
        completedItemIds: [],
      };

      await expect(
        service.assignTemplate(adminUser(), {
          employeeId: 'emp_ada',
          templateId: 'tpl_eng',
        }),
      ).resolves.toEqual(expectedRow);
      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        expectedRow,
      ]);
    });

    it('refuses to switch an employee to a different template once assigned', async () => {
      fake.seed('employee', [employeeRow({ status: 'ONBOARDING' })]);
      fake.seed('onboardingTemplate', [
        {
          id: 'tpl_sales',
          organizationId: ORG_A,
          name: 'Sales onboarding',
          revision: 1,
        },
      ]);
      await service.assignTemplate(adminUser(), {
        employeeId: 'emp_ada',
        templateId: 'tpl_eng',
      });

      await expect(
        service.assignTemplate(adminUser(), {
          employeeId: 'emp_ada',
          templateId: 'tpl_sales',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('setChecklistItem', () => {
    beforeEach(() => {
      fake.seed('employee', [employeeRow({ status: 'ONBOARDING' })]);
      fake.seed('employeeOnboarding', [
        { employeeId: 'emp_ada', organizationId: ORG_A, templateId: 'tpl_eng' },
      ]);
      fake.seed('onboardingItemCompletion', [
        {
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          itemId: 'item_contract',
          completedByUserId: 'user_admin',
          completedAt: new Date('2026-09-01T09:00:00.000Z'),
        },
      ]);
    });

    it('completing an item persists it alongside existing progress', async () => {
      const expectedRow = {
        employeeId: 'emp_ada',
        employeeName: 'Ada Okafor',
        avatarInitials: 'AO',
        jobTitle: 'Software Engineer',
        startDate: '2026-01-05',
        templateId: 'tpl_eng',
        completedItemIds: ['item_contract', 'item_laptop'],
      };

      await expect(
        service.setChecklistItem(adminUser(), 'emp_ada', 'item_laptop', {
          completed: true,
        }),
      ).resolves.toEqual(expectedRow);
      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        expectedRow,
      ]);
    });
  });
});
