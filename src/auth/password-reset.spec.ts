import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';

describe('AuthService — Password Reset & Change Flow', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    verification: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    session: {
      updateMany: jest.Mock;
    };
  };
  let emailServiceMock: {
    send: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      verification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'verif-1' }),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 'verif-1' }),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    emailServiceMock = {
      send: jest.fn().mockResolvedValue({ id: 'email-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    it('returns generic success message when email is not found (anti-enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('If an account exists');
      expect(prismaMock.verification.create).not.toHaveBeenCalled();
      expect(emailServiceMock.send).not.toHaveBeenCalled();
    });

    it('generates token and creates verification record when email exists', async () => {
      process.env.SENDBYTE_API_KEY = 'test-key';
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-123',
        email: 'user@example.com',
      });

      const res = await service.forgotPassword({ email: 'user@example.com' });

      expect(res.success).toBe(true);
      expect(prismaMock.verification.deleteMany).toHaveBeenCalled();
      expect(prismaMock.verification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: 'password-reset:user@example.com',
          value: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      expect(emailServiceMock.send).toHaveBeenCalled();
    });
  });

  describe('verifyResetToken', () => {
    it('throws BadRequestException for invalid or missing token', async () => {
      prismaMock.verification.findFirst.mockResolvedValue(null);

      await expect(service.verifyResetToken('invalid-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if token is from a different verification type (cross-type token)', async () => {
      prismaMock.verification.findFirst.mockResolvedValue({
        id: 'verif-1',
        identifier: 'email-verification:user@example.com',
        value: 'hashed-token',
        expiresAt: new Date(Date.now() + 10000),
      });

      await expect(service.verifyResetToken('otp-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns valid: true and email for a valid reset token', async () => {
      prismaMock.verification.findFirst.mockResolvedValue({
        id: 'verif-1',
        identifier: 'password-reset:user@example.com',
        value: 'hashed-token',
        expiresAt: new Date(Date.now() + 10000),
      });

      const res = await service.verifyResetToken('valid-token');
      expect(res).toEqual({ valid: true, email: 'user@example.com' });
    });
  });

  describe('resetPassword', () => {
    it('throws BadRequestException if passwords do not match', async () => {
      await expect(
        service.resetPassword({
          token: 'some-token',
          password: 'Password123456!',
          confirmPassword: 'DifferentPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if token is invalid or expired', async () => {
      prismaMock.verification.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'expired-token',
          password: 'Password123456!',
          confirmPassword: 'Password123456!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if user account no longer exists', async () => {
      prismaMock.verification.findFirst.mockResolvedValue({
        id: 'verif-1',
        identifier: 'password-reset:deleted@example.com',
        value: 'hashed-token',
        expiresAt: new Date(Date.now() + 10000),
      });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'valid-token',
          password: 'NewStrongPassword123!',
          confirmPassword: 'NewStrongPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets user password, revokes sessions, and consumes verification token', async () => {
      prismaMock.verification.findFirst.mockResolvedValue({
        id: 'verif-1',
        identifier: 'password-reset:user@example.com',
        value: 'hashed-token',
        expiresAt: new Date(Date.now() + 10000),
      });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-123',
        email: 'user@example.com',
      });
      prismaMock.user.update.mockResolvedValue({ id: 'usr-123' });

      const res = await service.resetPassword({
        token: 'valid-token',
        password: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      });

      expect(res.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-123' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.verification.delete).toHaveBeenCalledWith({
        where: { id: 'verif-1' },
      });
    });
  });

  describe('changePassword', () => {
    it('throws BadRequestException if new password and confirmPassword mismatch', async () => {
      await expect(
        service.changePassword('usr-123', {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'MismatchPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if user has no password set', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-123',
        passwordHash: null,
      });

      await expect(
        service.changePassword('usr-123', {
          currentPassword: 'SomePassword123!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if current password is incorrect', async () => {
      const oldHash = await argon2.hash('RealOldPassword123!', {
        type: argon2.argon2id,
      });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-123',
        passwordHash: oldHash,
      });

      await expect(
        service.changePassword('usr-123', {
          currentPassword: 'WrongOldPassword123!',
          newPassword: 'NewStrongPassword123!',
          confirmPassword: 'NewStrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('successfully updates password and revokes active sessions', async () => {
      const oldHash = await argon2.hash('RealOldPassword123!', {
        type: argon2.argon2id,
      });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-123',
        passwordHash: oldHash,
      });
      prismaMock.user.update.mockResolvedValue({ id: 'usr-123' });

      const res = await service.changePassword('usr-123', {
        currentPassword: 'RealOldPassword123!',
        newPassword: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      });

      expect(res.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-123' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
