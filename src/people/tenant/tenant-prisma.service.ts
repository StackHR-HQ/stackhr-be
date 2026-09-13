import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type TenantClient = Prisma.TransactionClient;

/**
 * Runs People queries under Postgres RLS. The connection role bypasses RLS, so
 * each unit of work switches to the non-bypass `stackhr_app` role and scopes
 * `app.org_id` to the transaction (see the people_module migration).
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    organizationId: string,
    work: (client: TenantClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (client) => {
      await client.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
      await client.$executeRawUnsafe('SET LOCAL ROLE stackhr_app');
      return work(client);
    });
  }
}
