import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { runBypassingTenantContext } from '../database/tenant-context';
import { USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditQueryDto } from './dto/audit-query.dto';

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

  async listForOrganization(user: AuthenticatedUser, query: AuditQueryDto) {
    if (user.userType !== USER_TYPES.BUSINESS || !user.organizationId) {
      throw new ForbiddenException(
        'An active organization context is required',
      );
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
    };

    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const actorIds = Array.from(
      new Set(
        logs.map((l) => l.actorId).filter((id): id is string => Boolean(id)),
      ),
    );

    const actors =
      actorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return {
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        actorId: log.actorId,
        actor: log.actorId ? (actorMap.get(log.actorId) ?? null) : null,
        payload: this.safeParsePayload(log.payload),
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private safeParsePayload(payload: string | null): unknown {
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
}
