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

  /**
   * Lists paginated audit/security activity logs scoped to the caller's organization.
   * Defaults to semantic domain events (`AuditEvent`); pass `source=requests` for HTTP `AuditLog`.
   */
  async listForOrganization(user: AuthenticatedUser, query: AuditQueryDto) {
    if (user.userType !== USER_TYPES.BUSINESS || !user.organizationId) {
      throw new ForbiddenException(
        'An active organization context is required',
      );
    }

    const source = query.source ?? 'events';
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;
    const dateRange = this.buildDateRange(query.from, query.to);

    if (source === 'requests') {
      const where: Record<string, unknown> = {
        organizationId: user.organizationId,
      };
      if (query.action) where.action = query.action;
      if (query.resource) where.resource = query.resource;
      if (query.actorId) where.actorId = query.actorId;
      if (dateRange) where.createdAt = dateRange;

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      const actorMap = await this.resolveActorMap(
        logs.map((entry) => entry.actorId),
      );

      const data = logs.map((entry) => ({
        id: entry.id,
        source: 'requests' as const,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        actorId: entry.actorId,
        actor: entry.actorId ? (actorMap.get(entry.actorId) ?? null) : null,
        description: null,
        payload: this.parsePayload(entry.payload),
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: entry.createdAt,
      }));

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
    };
    if (query.action) where.action = query.action;
    if (query.resource) where.targetType = query.resource;
    if (query.actorId) where.actorUserId = query.actorId;
    if (dateRange) where.createdAt = dateRange;

    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    const actorMap = await this.resolveActorMap(
      events.map((entry) => entry.actorUserId),
    );

    const data = events.map((entry) => ({
      id: entry.id,
      source: 'events' as const,
      action: entry.action,
      resource: entry.targetType,
      resourceId: entry.targetId,
      actorId: entry.actorUserId,
      actor: entry.actorUserId
        ? (actorMap.get(entry.actorUserId) ?? null)
        : null,
      description: entry.description,
      payload: entry.changes ?? null,
      ipAddress: null,
      userAgent: null,
      createdAt: entry.createdAt,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private buildDateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) {
      range.gte = new Date(from);
    }
    if (to) {
      range.lte = /^\d{4}-\d{2}-\d{2}$/.test(to)
        ? new Date(`${to}T23:59:59.999Z`)
        : new Date(to);
    }
    return range;
  }

  private async resolveActorMap(actorIds: Array<string | null | undefined>) {
    const uniqueIds = Array.from(
      new Set(actorIds.filter((id): id is string => Boolean(id))),
    );
    if (uniqueIds.length === 0) {
      return new Map<string, { id: string; name: string; email: string }>();
    }
    const actors = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, email: true },
    });
    return new Map(actors.map((actor) => [actor.id, actor]));
  }

  private parsePayload(raw: string | null): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
