import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  async getStatus(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);

    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const activeEmployeeCount = await this.prisma.employee.count({
      where: { organizationId: orgId, status: 'ACTIVE' },
    });

    const createdAt = new Date(organization.createdAt);
    const trialEndsAt = new Date(
      createdAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const isTrialing = new Date() < trialEndsAt;

    return {
      status: isTrialing ? 'TRIALING' : 'ACTIVE',
      planName: 'GROWTH_TIER',
      trialStartedAt: createdAt.toISOString(),
      trialLengthDays: 30,
      trialEndsAt: trialEndsAt.toISOString(),
      activeEmployeeCount,
      seatLimit: 50,
      billingCycle: 'MONTHLY',
      nextBillingDate: trialEndsAt.toISOString(),
    };
  }
}
