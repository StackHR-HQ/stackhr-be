import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateOutboxEventParams,
  OutboxProcessResult,
} from './outbox.types';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async createEvent(params: CreateOutboxEventParams, prismaTx?: any) {
    const db = prismaTx ?? this.prisma;
    const {
      organizationId,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      maxRetries = 5,
    } = params;

    return await db.outboxEvent.create({
      data: {
        id: randomUUID(),
        organizationId,
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as any,
        status: 'PENDING',
        maxRetries,
        nextRetryAt: new Date(),
      },
    });
  }

  async processPending(batchSize = 20): Promise<OutboxProcessResult> {
    const now = new Date();

    const pendingEvents = await this.prisma.outboxEvent.findMany({
      where: {
        OR: [
          { status: 'PENDING', nextRetryAt: { lte: now } },
          { status: 'PROCESSING', lockedUntil: { lte: now } }, // Reclaim stale locks
        ],
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    let processedCount = 0;
    let failedCount = 0;
    let deadLetterCount = 0;

    for (const event of pendingEvents) {
      // Mark as PROCESSING with 60-second lease
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSING',
          lockedUntil: new Date(Date.now() + 60000),
        },
      });

      try {
        // Dispatch to domain listeners asynchronously
        await this.eventEmitter.emitAsync(event.eventType, event.payload);

        // Success: mark PROCESSED
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lockedUntil: null,
          },
        });
        this.metricsService?.recordOutboxEvent(event.eventType, 'published');
        processedCount++;
      } catch (err: any) {
        failedCount++;
        const nextRetryCount = event.retryCount + 1;

        if (nextRetryCount >= event.maxRetries) {
          // Route to Dead Letter Queue (DLQ)
          deadLetterCount++;
          await this.prisma.deadLetterEvent.create({
            data: {
              id: randomUUID(),
              organizationId: event.organizationId,
              originalId: event.id,
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload as any,
              failureReason: err?.message || 'Unknown processing error',
              stackTrace: err?.stack,
              retryCount: nextRetryCount,
            },
          });

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              retryCount: nextRetryCount,
              lastError: err?.message || 'Processing failed after max retries',
              lockedUntil: null,
            },
          });

          this.metricsService?.recordOutboxEvent(event.eventType, 'dlq_routed');

          this.logger.error(
            `Outbox event [${event.id}] (${event.eventType}) moved to DEAD LETTER QUEUE after ${nextRetryCount} attempts: ${err?.message}`,
            err?.stack,
          );
        } else {
          // Exponential backoff: min(60s, 2s * 2^retries)
          const delayMs = Math.min(60000, 2000 * Math.pow(2, nextRetryCount));
          const nextRetryAt = new Date(Date.now() + delayMs);

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PENDING',
              retryCount: nextRetryCount,
              nextRetryAt,
              lastError: err?.message,
              lockedUntil: null,
            },
          });

          this.metricsService?.recordOutboxEvent(event.eventType, 'failed');

          this.logger.warn(
            `Outbox event [${event.id}] (${event.eventType}) attempt ${nextRetryCount} failed: ${err?.message}. Retrying at ${nextRetryAt.toISOString()}`,
          );
        }
      }
    }

    return { processedCount, failedCount, deadLetterCount };
  }

  async getDeadLetterEvents(organizationId?: string, limit = 50) {
    return this.prisma.deadLetterEvent.findMany({
      where: organizationId ? { organizationId } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async replayDeadLetterEvent(dlqId: string) {
    const dlqEvent = await this.prisma.deadLetterEvent.findUnique({
      where: { id: dlqId },
    });

    if (!dlqEvent) {
      throw new NotFoundException(
        `Dead letter event with ID ${dlqId} not found`,
      );
    }

    const replayed = await this.prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        organizationId: dlqEvent.organizationId,
        eventType: dlqEvent.eventType,
        aggregateType: dlqEvent.aggregateType,
        aggregateId: dlqEvent.aggregateId,
        payload: dlqEvent.payload as any,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 5,
        nextRetryAt: new Date(),
      },
    });

    await this.prisma.deadLetterEvent.delete({
      where: { id: dlqId },
    });

    this.logger.log(
      `Replayed DLQ event [${dlqId}] as new outbox event [${replayed.id}]`,
    );

    return replayed;
  }

  async getDlqCount(organizationId?: string): Promise<number> {
    return this.prisma.deadLetterEvent.count({
      where: organizationId ? { organizationId } : undefined,
    });
  }
}
