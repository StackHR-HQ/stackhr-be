import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import { avatarInitials, toDateOnly } from '../common/people-mappers';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import type { SaveOnboardingTemplateDto } from './dto/onboarding.dto';

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

  createTemplate(user: AuthenticatedUser, input: SaveOnboardingTemplateDto) {
    const organizationId = requirePeopleOrganization(user);
    const name = requireId(input.name ?? input.title, 'name');
    const rawItems = input.checklist ?? input.tasks ?? [];

    return this.tenant.run(organizationId, async (client) => {
      const resolvedDepartmentIds = await this.resolveDepartmentIds(
        client,
        organizationId,
        input,
      );

      const template = await client.onboardingTemplate.create({
        data: {
          organizationId,
          name,
          revision: 1,
        },
      });

      for (const departmentId of resolvedDepartmentIds) {
        await client.onboardingTemplateDepartment.deleteMany({
          where: { organizationId, departmentId },
        });
        await client.onboardingTemplateDepartment.create({
          data: {
            organizationId,
            templateId: template.id,
            departmentId,
          },
        });
      }

      const createdItems: Array<{ id: string; label: string; stage: string }> =
        [];
      for (const [index, item] of rawItems.entries()) {
        const label = requireId(item.label ?? item.title, 'label');
        const stage =
          typeof item.stage === 'string' && item.stage.trim()
            ? item.stage.trim()
            : 'Day one';
        const created = await client.onboardingChecklistItem.create({
          data: {
            organizationId,
            templateId: template.id,
            label,
            stage,
            position: index,
          },
        });
        createdItems.push({
          id: created.id,
          label: created.label,
          stage: created.stage,
        });
      }

      return {
        id: template.id,
        name: template.name,
        departmentIds: resolvedDepartmentIds,
        checklist: createdItems,
      };
    });
  }

  updateTemplate(
    user: AuthenticatedUser,
    templateId: string,
    input: SaveOnboardingTemplateDto,
  ) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const existing = await client.onboardingTemplate.findFirst({
        where: { id: templateId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Onboarding template was not found');
      }

      const nextName =
        input.name !== undefined || input.title !== undefined
          ? requireId(input.name ?? input.title, 'name')
          : existing.name;

      const updated = await client.onboardingTemplate.update({
        where: { id: templateId },
        data: {
          name: nextName,
          revision: (existing.revision ?? 1) + 1,
        },
      });

      if (input.departmentIds !== undefined || input.department !== undefined) {
        const resolvedDepartmentIds = await this.resolveDepartmentIds(
          client,
          organizationId,
          input,
        );
        await client.onboardingTemplateDepartment.deleteMany({
          where: { organizationId, templateId },
        });
        for (const departmentId of resolvedDepartmentIds) {
          await client.onboardingTemplateDepartment.deleteMany({
            where: { organizationId, departmentId },
          });
          await client.onboardingTemplateDepartment.create({
            data: {
              organizationId,
              templateId,
              departmentId,
            },
          });
        }
      }

      const rawItems = input.checklist ?? input.tasks;
      if (rawItems !== undefined) {
        const existingItems = await client.onboardingChecklistItem.findMany({
          where: { organizationId, templateId },
        });
        const existingMap = new Map(
          existingItems.map((item) => [item.id, item]),
        );
        const incomingIds = new Set<string>();

        for (const [index, item] of rawItems.entries()) {
          const label = requireId(item.label ?? item.title, 'label');
          const stage =
            typeof item.stage === 'string' && item.stage.trim()
              ? item.stage.trim()
              : 'Day one';
          const itemId = typeof item.id === 'string' ? item.id.trim() : null;

          if (itemId && existingMap.has(itemId)) {
            incomingIds.add(itemId);
            await client.onboardingChecklistItem.update({
              where: { id: itemId },
              data: {
                label,
                stage,
                position: index,
              },
            });
          } else {
            const created = await client.onboardingChecklistItem.create({
              data: {
                id: randomUUID(),
                organizationId,
                templateId,
                label,
                stage,
                position: index,
              },
            });
            incomingIds.add(created.id);
          }
        }

        // Diff-based cleanup: only delete items that have zero employee completions
        const toRemove = existingItems.filter((it) => !incomingIds.has(it.id));
        for (const item of toRemove) {
          const completionsCount = await client.onboardingItemCompletion.count({
            where: { organizationId, itemId: item.id },
          });
          if (completionsCount === 0) {
            await client.onboardingChecklistItem.delete({
              where: { id: item.id },
            });
          }
        }
      }

      const [defaults, items] = await Promise.all([
        client.onboardingTemplateDepartment.findMany({
          where: { organizationId, templateId },
        }),
        client.onboardingChecklistItem.findMany({
          where: { organizationId, templateId },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
      ]);

      return {
        id: updated.id,
        name: updated.name,
        departmentIds: defaults.map((d) => d.departmentId),
        checklist: items.map((item) => ({
          id: item.id,
          label: item.label,
          stage: item.stage,
        })),
      };
    });
  }

  deleteTemplate(user: AuthenticatedUser, templateId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const existing = await client.onboardingTemplate.findFirst({
        where: { id: templateId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Onboarding template was not found');
      }
      const activeAssignments = await client.employeeOnboarding.count({
        where: { organizationId, templateId },
      });
      if (activeAssignments > 0) {
        throw new ConflictException({
          code: 'CONFLICT',
          message:
            'Cannot delete an onboarding template that is assigned to employees',
        });
      }
      await client.onboardingTemplateDepartment.deleteMany({
        where: { organizationId, templateId },
      });
      await client.onboardingChecklistItem.deleteMany({
        where: { organizationId, templateId },
      });
      await client.onboardingTemplate.delete({
        where: { id: templateId },
      });
    });
  }

  getEmployeeChecklist(user: AuthenticatedUser, employeeId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [employee, assignment] = await Promise.all([
        client.employee.findFirst({
          where: { id: employeeId, organizationId },
        }),
        client.employeeOnboarding.findFirst({
          where: { employeeId, organizationId },
        }),
      ]);
      if (!employee) {
        throw new NotFoundException('Employee was not found');
      }
      if (!assignment) {
        return {
          employeeId: employee.id,
          employeeName: employee.fullName,
          avatarInitials: avatarInitials(employee.fullName),
          jobTitle: employee.jobTitle,
          startDate: toDateOnly(employee.startDate),
          templateId: null,
          completedItemIds: [],
          checklist: [],
        };
      }

      const [items, completions] = await Promise.all([
        client.onboardingChecklistItem.findMany({
          where: { organizationId, templateId: assignment.templateId },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
        client.onboardingItemCompletion.findMany({
          where: { organizationId, employeeId },
          orderBy: [{ completedAt: 'asc' }, { itemId: 'asc' }],
        }),
      ]);
      const completionByItem = new Map(
        completions.map((c) => [c.itemId, c.completedAt]),
      );

      return {
        ...toOnboardingRow(employee, assignment.templateId, completions),
        checklist: items.map((item) => ({
          id: item.id,
          label: item.label,
          title: item.label,
          stage: item.stage,
          completed: completionByItem.has(item.id),
          completedAt: completionByItem.get(item.id)?.toISOString() ?? null,
        })),
      };
    });
  }

  private async resolveDepartmentIds(
    client: {
      department: {
        findMany: (args: {
          where: { organizationId: string };
        }) => Promise<Array<{ id: string; name: string }>>;
      };
    },
    organizationId: string,
    input: SaveOnboardingTemplateDto,
  ): Promise<string[]> {
    const ids = new Set<string>(input.departmentIds ?? []);
    if (input.department && input.department.trim()) {
      const deptVal = input.department.trim();
      const departments = await client.department.findMany({
        where: { organizationId },
      });
      const match = departments.find(
        (d) =>
          d.id === deptVal || d.name.toLowerCase() === deptVal.toLowerCase(),
      );
      if (match) {
        ids.add(match.id);
      }
    }
    return Array.from(ids);
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

  completeOnboarding(user: AuthenticatedUser, employeeId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const employee = await client.employee.findFirst({
        where: { id: employeeId, organizationId },
      });
      if (!employee) {
        throw new NotFoundException('Employee was not found');
      }

      const updated = await client.employee.update({
        where: { id: employeeId },
        data: { status: 'ACTIVE' },
      });

      await client.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'employee.onboarding_completed',
          targetType: 'employee',
          targetId: employee.id,
          employeeId,
          description: `${employee.fullName} completed onboarding and transitioned to ACTIVE`,
          changes: { status: { from: employee.status, to: 'ACTIVE' } },
          createdAt: new Date(),
        },
      });

      return {
        message: 'Onboarding completed and employee activated successfully',
        employeeId: updated.id,
        status: updated.status,
      };
    });
  }
}
