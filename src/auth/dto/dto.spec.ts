import { validate } from 'class-validator';
import { SignupBusinessDto } from './signup-business.dto';
import { VerifyEmailDto } from './verify-email.dto';
import { ResendVerificationDto } from './resend-verification.dto';
import { LoginDto } from './login.dto';
import { SwitchOrganizationDto } from './switch-organization.dto';

describe('Auth DTOs', () => {
  describe('SignupBusinessDto', () => {
    it('should pass with valid data', async () => {
      const dto = new SignupBusinessDto();
      dto.email = 'test@example.com';
      dto.password = 'Password123456';
      dto.confirmPassword = 'Password123456';
      dto.companyName = 'Acme Corp';
      dto.organizationSlug = 'acme-corp';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email and short password', async () => {
      const dto = new SignupBusinessDto();
      dto.email = 'invalid-email';
      dto.password = 'short';
      dto.confirmPassword = 'short';
      dto.companyName = '';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const propertyNames = errors.map((e) => e.property);
      expect(propertyNames).toContain('email');
      expect(propertyNames).toContain('password');
      expect(propertyNames).toContain('companyName');
    });
  });

  describe('VerifyEmailDto', () => {
    it('should pass with valid 6-digit code', async () => {
      const dto = new VerifyEmailDto();
      dto.email = 'user@example.com';
      dto.code = '123456';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when code is not 6 digits', async () => {
      const dto = new VerifyEmailDto();
      dto.email = 'user@example.com';
      dto.code = '123';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('code');
    });
  });

  describe('ResendVerificationDto', () => {
    it('should pass with valid email', async () => {
      const dto = new ResendVerificationDto();
      dto.email = 'user@example.com';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty or invalid email', async () => {
      const dto = new ResendVerificationDto();
      dto.email = 'bad-email';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
    });
  });

  describe('LoginDto', () => {
    it('should pass with valid email and password', async () => {
      const dto = new LoginDto();
      dto.email = 'user@example.com';
      dto.password = 'validpassword123';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with short password', async () => {
      const dto = new LoginDto();
      dto.email = 'user@example.com';
      dto.password = '123';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('password');
    });
  });

  describe('SwitchOrganizationDto', () => {
    it('should pass with valid organizationId', async () => {
      const dto = new SwitchOrganizationDto();
      dto.organizationId = 'org-uuid-1234';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when organizationId is empty', async () => {
      const dto = new SwitchOrganizationDto();
      dto.organizationId = '';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('organizationId');
    });
  });
});
