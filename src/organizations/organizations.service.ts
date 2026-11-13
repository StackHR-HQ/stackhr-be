import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

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

  async updateCurrent(user: AuthenticatedUser, dto: UpdateOrganizationDto) {
    if (user.userType !== USER_TYPES.BUSINESS || !user.organizationId) {
      throw new ForbiddenException(
        'An active organization context is required',
      );
    }

    if (
      dto.pensionEmployeeRateOverride !== undefined &&
      dto.pensionEmployeeRateOverride !== null &&
      dto.pensionEmployeeRateOverride < 0.08
    ) {
      throw new BadRequestException(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    }
    if (
      dto.pensionEmployerRateOverride !== undefined &&
      dto.pensionEmployerRateOverride !== null &&
      dto.pensionEmployerRateOverride < 0.1
    ) {
      throw new BadRequestException(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    }

    const organization = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...dto,
        pensionBasisOverride:
          dto.pensionBasisOverride !== undefined
            ? dto.pensionBasisOverride
              ? dto.pensionBasisOverride.trim().toUpperCase()
              : null
            : undefined,
      },
    });

    return organization;
  }
}
