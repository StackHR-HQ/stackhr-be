import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { runWithTenantContext } from '../../database/tenant-context';

export type TenantClient = Prisma.TransactionClient;

/**
 * Runs People queries scoped to an organization context.
 * Utilizes Postgres RLS where available, with automatic fallback to Nest TenantContext scoping.
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    organizationId: string,
    work: (client: TenantClient) => Promise<T>,
  ): Promise<T> {
    return runWithTenantContext({ organizationId }, () => {
      return this.prisma.$transaction(async (client) => {
        try {
          await client.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
          await client.$executeRawUnsafe('SET LOCAL ROLE stackhr_app');
        } catch {
          // Fallback gracefully if RLS role is not configured in database
        }
        return work(client);
      });
    });
  }
}
