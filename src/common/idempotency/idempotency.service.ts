import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

export interface AcquireKeyParams {
  organizationId: string;
  userId: string;
  key: string;
  endpoint: string;
  body: unknown;
  lockTimeoutSeconds?: number;
}

export type AcquireKeyResult =
  | {
      isReplay: false;
      recordId: string;
    }
  | {
      isReplay: true;
      recordId: string;
      statusCode: number;
      responseBody: unknown;
    };

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashPayload(payload: unknown): string {
    if (payload === undefined || payload === null) {
      return createHash('sha256').update('').digest('hex');
    }
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return createHash('sha256').update(str).digest('hex');
  }

  async acquireKey(params: AcquireKeyParams): Promise<AcquireKeyResult> {
    const {
      organizationId,
      userId,
      key,
      endpoint,
      body,
      lockTimeoutSeconds = 120,
    } = params;

    const requestHash = this.hashPayload(body);
    const lockDurationMs = lockTimeoutSeconds * 1000;
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + lockDurationMs);

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key,
        },
      },
    });

    if (!existing) {
      try {
        const created = await this.prisma.idempotencyKey.create({
          data: {
            id: randomUUID(),
            organizationId,
            key,
            userId,
            endpoint,
            requestHash,
            status: 'IN_PROGRESS',
            lockedUntil,
          },
        });
        return { isReplay: false, recordId: created.id };
      } catch {
        // Race condition: another request created the record simultaneously
        return this.acquireKey(params);
      }
    }

    if (existing.status === 'IN_PROGRESS') {
      if (existing.lockedUntil > now) {
        throw new ConflictException(
          'A request with this idempotency key is currently in progress. Please retry shortly.',
        );
      }

      // Lock expired (previous worker crashed or timed out); reclaim lease
      await this.prisma.idempotencyKey.update({
        where: { id: existing.id },
        data: {
          userId,
          endpoint,
          requestHash,
          lockedUntil,
          updatedAt: now,
        },
      });
      return { isReplay: false, recordId: existing.id };
    }

    if (existing.status === 'COMPLETED') {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency key was previously used with a different request payload.',
        );
      }

      return {
        isReplay: true,
        recordId: existing.id,
        statusCode: existing.statusCode ?? 200,
        responseBody: existing.responseBody,
      };
    }

    // Status is FAILED: allow retry with fresh lock
    await this.prisma.idempotencyKey.update({
      where: { id: existing.id },
      data: {
        status: 'IN_PROGRESS',
        userId,
        endpoint,
        requestHash,
        lockedUntil,
        updatedAt: now,
      },
    });
    return { isReplay: false, recordId: existing.id };
  }

  async completeKey(
    recordId: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { id: recordId },
      data: {
        status: 'COMPLETED',
        statusCode,
        responseBody: responseBody as any,
      },
    });
  }

  async failKey(recordId: string): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { id: recordId },
      data: {
        status: 'FAILED',
      },
    });
  }
}
