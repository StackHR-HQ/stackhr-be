import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeOffboardingSchedulerService } from './employee-offboarding-scheduler.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';

describe('EmployeeOffboardingSchedulerService', () => {
  let service: EmployeeOffboardingSchedulerService;
  let prismaMock: any;
  let authServiceMock: { revokeUserSessionsForOrganization: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    authServiceMock = {
      revokeUserSessionsForOrganization: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeOffboardingSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    service = module.get(EmployeeOffboardingSchedulerService);
  });

  it('finalizes due OFFBOARDING employees, revokes org-scoped sessions, and logs AuditEvent', async () => {
    const dueDate = new Date('2026-11-25T00:00:00Z');
    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        organizationId: 'org-1',
        userId: 'usr-1',
        fullName: 'Ada Obi',
        terminationDate: dueDate,
      },
    ]);

    const count = await service.finalizeDueOffboardings(
      new Date('2026-11-26T00:00:00Z'),
    );

    expect(count).toBe(1);
    expect(prismaMock.employee.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'emp-1',
        organizationId: 'org-1',
        status: 'OFFBOARDING',
      },
      data: { status: 'OFFBOARDED' },
    });
    expect(
      authServiceMock.revokeUserSessionsForOrganization,
    ).toHaveBeenCalledWith('usr-1', 'org-1');
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        action: 'employee.offboard_completed',
        targetId: 'emp-1',
      }),
    });
  });
});
