import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingCycleService } from './billing-cycle.service';

/** Arbitrary constant identifying the billing-cycle advisory lock. */
const BILLING_CYCLE_LOCK_KEY = 7_841_221_001;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Runs the billing clock hourly (steps are idempotent). A transaction-level
 * advisory lock ensures one instance runs it at a time under PM2/cluster;
 * same setInterval pattern as the outbox processor.
 */
@Injectable()
export class BillingCycleRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BillingCycleRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cycle: BillingCycleService,
  ) {}

  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.BILLING_CYCLE_DISABLED === 'true'
    ) {
      return;
    }
    const interval =
      Number(process.env.BILLING_CYCLE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
    this.logger.log(
      `Billing cycle runner started (every ${interval / 60000} min)`,
    );
    this.timer = setInterval(() => void this.tick(), interval);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runExclusive(new Date());
      if (!('skipped' in result)) {
        this.logger.log(`Billing cycle: ${JSON.stringify(result)}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Billing cycle failed: ${error?.message ?? error}`,
        error?.stack,
      );
    } finally {
      this.running = false;
    }
  }

  /** Runs every step once, unless another instance holds the lock. */
  runExclusive(now: Date) {
    return this.prisma.$transaction(
      async (tx: any) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${BILLING_CYCLE_LOCK_KEY}::bigint) AS locked`;
        if (!row?.locked) return { skipped: true as const };

        // The lock lives for this transaction; the steps use their own connections.
        const renewals = await this.cycle.issueRenewals(now);
        const periodEnds = await this.cycle.processPeriodEnds(now);
        const overage = await this.cycle.issueOverageTrueUps(now);
        return {
          ranAt: now.toISOString(),
          renewalsIssued: renewals.issued,
          ...periodEnds,
          overageInvoicesIssued: overage.issued,
        };
      },
      { maxWait: 10_000, timeout: 15 * 60 * 1000 },
    );
  }
}
