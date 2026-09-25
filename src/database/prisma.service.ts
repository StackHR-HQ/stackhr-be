import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { getTenantContext } from './tenant-context';

const TENANT_SCOPED_MODELS = [
  'Employee',
  'Member',
  'Invitation',
  'ApprovalRequest',
  'LeaveType',
  'LeavePolicy',
  'LeaveBalance',
  'LeaveRequest',
  'Expense',
  'Reimbursement',
  'SalaryAdvance',
  'CompensationRecord',
  'PayrollRun',
  'PayrollItem',
  'Payslip',
];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public readonly tenantClient: any;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required to start the application');
    }

    super({ adapter: new PrismaPg({ connectionString }) });

    this.tenantClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenant = getTenantContext();

            if (tenant?.isBypassed) {
              return query(args);
            }

            const orgId = tenant?.organizationId;

            if (orgId && model && TENANT_SCOPED_MODELS.includes(model)) {
              if (
                [
                  'findFirst',
                  'findMany',
                  'count',
                  'aggregate',
                  'groupBy',
                ].includes(operation)
              ) {
                (args as any).where = {
                  ...(args as any).where,
                  organizationId: orgId,
                };
              }

              if (
                ['update', 'updateMany', 'delete', 'deleteMany'].includes(
                  operation,
                )
              ) {
                (args as any).where = {
                  ...(args as any).where,
                  organizationId: orgId,
                };
              }

              if (operation === 'create') {
                (args as any).data = {
                  ...(args as any).data,
                  organizationId: (args as any).data?.organizationId ?? orgId,
                };
              }

              if (
                operation === 'createMany' ||
                operation === 'createManyAndReturn'
              ) {
                if (Array.isArray((args as any).data)) {
                  (args as any).data = (args as any).data.map((item: any) => ({
                    ...item,
                    organizationId: item.organizationId ?? orgId,
                  }));
                }
              }
            }

            return query(args);
          },
        },
      },
    });

    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (
          typeof prop === 'string' &&
          TENANT_SCOPED_MODELS.includes(
            (target as PrismaService).capitalizeModelName(prop),
          ) &&
          prop in target.tenantClient
        ) {
          return target.tenantClient[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  public capitalizeModelName(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
