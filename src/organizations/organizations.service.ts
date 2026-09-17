import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(user: AuthenticatedUser) {
    const administratorRoles: string[] = [
      USER_ROLES.BUSINESS_OWNER,
      USER_ROLES.BUSINESS_ADMIN,
      USER_ROLES.HR_ADMIN,
    ];
    if (
      user.userType !== USER_TYPES.BUSINESS ||
      !user.organizationId ||
      !administratorRoles.includes(user.role)
    ) {
      throw new ForbiddenException(
        'A business administrator session is required',
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
