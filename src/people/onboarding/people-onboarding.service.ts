import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import { avatarInitials, toDateOnly } from '../common/people-mappers';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

function toOnboardingRow(
  employee: { id: string; fullName: string; jobTitle: string; startDate: Date },
  templateId: string,
  completions: Array<{ employeeId: string; itemId: string }>,
) {
  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    avatarInitials: avatarInitials(employee.fullName),
    jobTitle: employee.jobTitle,
    startDate: toDateOnly(employee.startDate),
    templateId,
    completedItemIds: completions
      .filter((completion) => completion.employeeId === employee.id)
      .map((completion) => completion.itemId),
  };
}

function fieldError(field: string, message: string) {
  return new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message,
    fields: { [field]: message },
  });
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw fieldError(field, `${field} is required`);
  }
  return value.trim();
}

@Injectable()
export class PeopleOnboardingService {
  constructor(private readonly tenant: TenantPrismaService) {}

  listTemplates(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [templates, defaults, items] = await Promise.all([
        client.onboardingTemplate.findMany({
          where: { organizationId },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        client.onboardingTemplateDepartment.findMany({
          where: { organizationId },
        }),
        client.onboardingChecklistItem.findMany({
          where: { organizationId },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
      ]);

      return templates.map((template) => ({
        id: template.id,
        name: template.name,
        departmentIds: defaults
          .filter((link) => link.templateId === template.id)
          .map((link) => link.departmentId),
        checklist: items
          .filter((item) => item.templateId === template.id)
          .map((item) => ({
            id: item.id,
            label: item.label,
            stage: item.stage,
          })),
      }));
    });
  }

  listEmployees(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [employees, assignments, completions] = await Promise.all([
        client.employee.findMany({
          where: {
            organizationId,
            status: { in: ['ONBOARDING', 'PENDING_INVITATION'] },
          },
          orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        }),
        client.employeeOnboarding.findMany({ where: { organizationId } }),
        client.onboardingItemCompletion.findMany({
          where: { organizationId },
          orderBy: [{ completedAt: 'asc' }, { itemId: 'asc' }],
        }),
      ]);
      const templateByEmployee = new Map(
        assignments.map((assignment) => [
          assignment.employeeId,
          assignment.templateId,
        ]),
      );

      // Only persisted assignments are shown; a GET never assigns templates.
      return employees
        .filter((employee) => templateByEmployee.has(employee.id))
        .map((employee) =>
          toOnboardingRow(
            employee,
            templateByEmployee.get(employee.id)!,
            completions,
          ),
        );
    });
  }

  assignTemplate(
    user: AuthenticatedUser,
    input: { employeeId: unknown; templateId: unknown },
  ) {
    const organizationId = requirePeopleOrganization(user);
    const employeeId = requireId(input.employeeId, 'employeeId');
    const templateId = requireId(input.templateId, 'templateId');

    return this.tenant.run(organizationId, async (client) => {
      const [employee, template] = await Promise.all([
        client.employee.findFirst({
          where: { id: employeeId, organizationId },
        }),
        client.onboardingTemplate.findFirst({
          where: { id: templateId, organizationId },
        }),
      ]);
      if (!employee) {
        throw fieldError(
          'employeeId',
          'Employee was not found in this organization',
        );
      }
      if (!template) {
        throw fieldError(
          'templateId',
          'Template was not found in this organization',
        );
      }

      const existing = await client.employeeOnboarding.findFirst({
        where: { employeeId, organizationId },
      });
      if (existing && existing.templateId !== templateId) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Employee already has a different onboarding template',
        });
      }
      if (!existing) {
        // Upsert so a concurrent identical assignment cannot fail on the unique key.
        await client.employeeOnboarding.upsert({
          where: { employeeId },
          create: {
            employeeId,
            organizationId,
            templateId,
            assignedAt: new Date(),
          },
          update: {},
        });
      }

      const completions = await client.onboardingItemCompletion.findMany({
        where: { organizationId, employeeId },
        orderBy: [{ completedAt: 'asc' }, { itemId: 'asc' }],
      });
      return toOnboardingRow(employee, templateId, completions);
    });
  }

  setChecklistItem(
    user: AuthenticatedUser,
    employeeId: string,
    itemId: string,
    input: { completed: unknown },
  ) {
    const organizationId = requirePeopleOrganization(user);
    if (typeof input.completed !== 'boolean') {
      const message = 'completed must be true or false';
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message,
        fields: { completed: message },
      });
    }
    const completed = input.completed;

    return this.tenant.run(organizationId, async (client) => {
      const [employee, assignment] = await Promise.all([
        client.employee.findFirst({
          where: { id: employeeId, organizationId },
        }),
        client.employeeOnboarding.findFirst({
          where: { employeeId, organizationId },
        }),
      ]);
      if (!employee || !assignment) {
        throw new NotFoundException('Employee onboarding was not found');
      }

      const item = await client.onboardingChecklistItem.findFirst({
        where: {
          id: itemId,
          organizationId,
          templateId: assignment.templateId,
        },
      });
      if (!item) {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message: "Checklist item is not part of this employee's template",
        });
      }

      const key = { employeeId_itemId: { employeeId, itemId } };
      const existing = await client.onboardingItemCompletion.findUnique({
        where: key,
      });

      // Each item is its own row, so concurrent updates to other items are kept.
      if (completed && !existing) {
        await client.onboardingItemCompletion.upsert({
          where: key,
          create: {
            organizationId,
            employeeId,
            itemId,
            completedByUserId: user.id,
            completedAt: new Date(),
          },
          // A concurrent identical completion keeps the first actor and time.
          update: {},
        });
      } else if (!completed && existing) {
        await client.onboardingItemCompletion.deleteMany({
          where: { organizationId, employeeId, itemId },
        });
      }

      if (completed !== Boolean(existing)) {
        await client.auditEvent.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: completed
              ? 'onboarding_item.completed'
              : 'onboarding_item.reopened',
            targetType: 'onboarding_checklist_item',
            targetId: item.id,
            employeeId,
            description: `Onboarding task "${item.label}" ${completed ? 'completed' : 'marked incomplete'}`,
            changes: { completed: { from: !completed, to: completed } },
            createdAt: new Date(),
          },
        });
      }

      const completions = await client.onboardingItemCompletion.findMany({
        where: { organizationId, employeeId },
        orderBy: [{ completedAt: 'asc' }, { itemId: 'asc' }],
      });
      return toOnboardingRow(employee, assignment.templateId, completions);
    });
  }
}
