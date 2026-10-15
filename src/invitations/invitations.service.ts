import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_TYPES } from '../auth/auth.constants';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { EmailService } from '../notifications/email.service';
import { invitationEmail } from '../notifications/email-templates';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  async createInvitation(user: AuthenticatedUser, dto: CreateInvitationDto) {
    const orgId = this.checkOrgContext(user);

    const existingPending = await this.prisma.invitation.findFirst({
      where: {
        email: dto.email,
        status: 'pending',
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'A pending invitation already exists for this email address',
      );
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.prisma.invitation.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        email: dto.email,
        role: dto.role ?? 'EMPLOYEE',
        expiresAt,
        status: 'pending',
        inviterId: user.id,
      },
    });

    const frontendBase =
      (process.env.FRONTEND_URL ?? '')
        .split(',')[0]
        .trim()
        .replace(/\/+$/, '') || 'https://app.stackhr.app';
    const inviteLink = `${frontendBase}/accept-invitation?invitationId=${invitation.id}`;

    void this.prisma.organization
      .findUnique({
        where: { id: orgId },
        select: { name: true },
      })
      .then((org) => {
        const orgName = org?.name ? ` to join ${org.name}` : '';
        const emailPayload = invitationEmail(dto.email, inviteLink);
        return this.emailService.send({
          to: dto.email,
          subject: `You have been invited${orgName} on StackHR`,
          html: emailPayload.html,
          text: emailPayload.text,
          idempotencyKey: `admin-invitation:${invitation.id}`,
        });
      })
      .catch((err: any) => {
        this.logger.warn(
          `Failed to dispatch invitation email to ${dto.email}: ${err?.message ?? err}`,
        );
      });

    return { invitation };
  }

  async findAll(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const invitations = await this.prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      invitations: invitations.map((inv) => {
        const copy = { ...inv };
        delete (copy as any).tokenHash;
        return copy;
      }),
    };
  }

  async getInvitationDetails(id: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo: true,
            slug: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException(`Invitation with ID "${id}" not found`);
    }

    const isExpired = invitation.expiresAt < new Date();
    if (isExpired && invitation.status === 'pending') {
      await this.prisma.invitation.update({
        where: { id },
        data: { status: 'expired' },
      });
      invitation.status = 'expired';
    }

    const safeInvitation = { ...invitation };
    delete (safeInvitation as any).tokenHash;
    return { invitation: safeInvitation };
  }

  async acceptInvitation(id: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException(`Invitation with ID "${id}" not found`);
    }

    if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation is invalid or has expired');
    }

    const hashedPassword = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const userResult = await this.prisma.$transaction(async (tx) => {
      let existingUser = await tx.user.findUnique({
        where: { email: invitation.email },
      });

      if (!existingUser) {
        const userId = randomUUID();
        existingUser = await tx.user.create({
          data: {
            id: userId,
            name: dto.fullName,
            email: invitation.email,
            emailVerified: true,
            userType: USER_TYPES.BUSINESS,
            role: invitation.role ?? 'EMPLOYEE',
            accounts: {
              create: {
                id: randomUUID(),
                accountId: invitation.email,
                providerId: 'credential',
                password: hashedPassword,
              },
            },
          },
        });
      }

      const existingMember = await tx.member.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: existingUser.id,
        },
      });

      if (!existingMember) {
        await tx.member.create({
          data: {
            id: randomUUID(),
            organizationId: invitation.organizationId,
            userId: existingUser.id,
            role: invitation.role ?? 'member',
            createdAt: new Date(),
          },
        });
      }

      const existingEmployee = invitation.employeeId
        ? await tx.employee.findUnique({
            where: { id: invitation.employeeId },
          })
        : await tx.employee.findFirst({
            where: {
              organizationId: invitation.organizationId,
              email: invitation.email,
            },
          });

      if (
        existingEmployee &&
        (existingEmployee.status === 'PENDING_INVITATION' ||
          existingEmployee.status === 'ONBOARDING')
      ) {
        await tx.employee.update({
          where: { id: existingEmployee.id },
          data: { status: 'ACTIVE' },
        });
      }

      await tx.invitation.update({
        where: { id },
        data: { status: 'accepted' },
      });

      return {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
      };
    });

    return {
      message: 'Invitation accepted successfully',
      user: userResult,
    };
  }

  async revokeInvitation(user: AuthenticatedUser, id: string) {
    this.checkOrgContext(user);
    const invitation = await this.prisma.invitation.findFirst({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException(`Invitation with ID "${id}" not found`);
    }

    const updated = await this.prisma.invitation.update({
      where: { id },
      data: { status: 'revoked' },
    });

    return {
      message: 'Invitation revoked successfully',
      invitation: updated,
    };
  }

  async resendInvitation(user: AuthenticatedUser, id: string) {
    this.checkOrgContext(user);
    const invitation = await this.prisma.invitation.findFirst({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException(`Invitation with ID "${id}" not found`);
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.invitation.update({
      where: { id },
      data: {
        status: 'pending',
        expiresAt: newExpiresAt,
      },
    });

    return {
      message: 'Invitation resent successfully',
      invitation: updated,
    };
  }
}
