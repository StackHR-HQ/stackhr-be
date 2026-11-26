import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { runBypassingTenantContext } from '../database/tenant-context';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class EmployeeOffboardingSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    EmployeeOffboardingSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  private readonly pollIntervalMs = Number(
    process.env.OFFBOARDING_SCHEDULER_INTERVAL_MS || 60 * 60 * 1000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.logger.log('Starting Employee Offboarding Background Scheduler');
    void this.finalizeDueOffboardings();
    this.timer = setInterval(() => {
      void this.finalizeDueOffboardings();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async finalizeDueOffboardings(now: Date = new Date()): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;

    try {
      return await runBypassingTenantContext(async () => {
        const dueEmployees = await this.prisma.employee.findMany({
          where: {
            status: 'OFFBOARDING',
            terminationDate: { lte: now },
          },
          select: {
            id: true,
            organizationId: true,
            userId: true,
            fullName: true,
            terminationDate: true,
          },
        });

        let completedCount = 0;
        for (const emp of dueEmployees) {
          const updated = await this.prisma.employee.updateMany({
            where: {
              id: emp.id,
              organizationId: emp.organizationId,
              status: 'OFFBOARDING',
            },
            data: { status: 'OFFBOARDED' },
          });

          if (updated.count === 0) {
            continue;
          }

          if (emp.userId) {
            await this.authService.revokeUserSessionsForOrganization(
              emp.userId,
              emp.organizationId,
            );
          }

          await this.prisma.auditEvent.create({
            data: {
              organizationId: emp.organizationId,
              actorUserId: emp.userId ?? 'system',
              action: 'employee.offboard_completed',
              targetType: 'employee',
              targetId: emp.id,
              employeeId: emp.id,
              description: `Scheduled offboarding completed for ${emp.fullName}`,
              changes: {
                previousStatus: 'OFFBOARDING',
                status: 'OFFBOARDED',
                terminationDate: emp.terminationDate?.toISOString() ?? null,
              },
            },
          });

          completedCount += 1;
        }

        if (completedCount > 0) {
          this.logger.log(
            `Finalized ${completedCount} due scheduled offboarding(s)`,
          );
        }
        return completedCount;
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to finalize due offboardings: ${msg}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
