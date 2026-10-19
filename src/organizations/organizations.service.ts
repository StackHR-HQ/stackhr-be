import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(user: AuthenticatedUser) {
    if (user.userType !== USER_TYPES.BUSINESS || !user.organizationId) {
      throw new ForbiddenException(
        'An active organization context is required',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization was not found');
    }

    return organization;
  }
}
