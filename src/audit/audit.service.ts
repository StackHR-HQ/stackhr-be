import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { runBypassingTenantContext } from '../database/tenant-context';

export interface CreateAuditLogInput {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  payload?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      const sanitizedPayload = input.payload
        ? JSON.stringify(this.sanitizePayload(input.payload))
        : null;

      await runBypassingTenantContext(async () => {
        await this.prisma.auditLog.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId ?? null,
            actorId: input.actorId ?? null,
            action: input.action,
            resource: input.resource,
            resourceId: input.resourceId ?? null,
            payload: sanitizedPayload,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          },
        });
      });
    } catch (error) {
      console.error('Failed to create audit log entry:', error);
    }
  }

  public sanitizePayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveFields = [
      'password',
      'confirmPassword',
      'token',
      'secret',
      'code',
    ];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (sensitiveFields.includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = Array.isArray(value)
          ? value
          : this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
