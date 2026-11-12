import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import {
  AttachEmployerDto,
  UpdatePensionConfigDto,
  UpdatePensionRatesDto,
  ValidateEmployerCodeDto,
} from './pension.dto';

describe('Pension DTOs', () => {
  describe('ValidateEmployerCodeDto', () => {
    it('accepts valid PenCom code via employerCode in camelCase', async () => {
      const dto = plainToInstance(ValidateEmployerCodeDto, {
        employerCode: 'pr0000126311',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.getCode()).toBe('PR0000126311');
    });

    it('accepts valid PenCom code via employer_code in snake_case', async () => {
      const dto = plainToInstance(ValidateEmployerCodeDto, {
        employer_code: '  PR0000126311  ',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.getCode()).toBe('PR0000126311');
    });

    it('rejects invalid PenCom format', async () => {
      const dto = plainToInstance(ValidateEmployerCodeDto, {
        employerCode: 'INVALID123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.matches).toBeDefined();
    });

    it('throws BadRequestException when neither employerCode nor employer_code is present', () => {
      const dto = plainToInstance(ValidateEmployerCodeDto, {});
      expect(() => dto.getCode()).toThrow(BadRequestException);
    });
  });

  describe('AttachEmployerDto', () => {
    it('accepts validationId in camelCase', async () => {
      const dto = plainToInstance(AttachEmployerDto, {
        validationId: '  ev_ac33fd33551d4120935e764467322652  ',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.getValidationId()).toBe('ev_ac33fd33551d4120935e764467322652');
    });

    it('accepts validation_id in snake_case', async () => {
      const dto = plainToInstance(AttachEmployerDto, {
        validation_id: 'ev_ac33fd33551d4120935e764467322652',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.getValidationId()).toBe('ev_ac33fd33551d4120935e764467322652');
    });

    it('throws BadRequestException when neither validationId nor validation_id is present', () => {
      const dto = plainToInstance(AttachEmployerDto, {});
      expect(() => dto.getValidationId()).toThrow(BadRequestException);
    });
  });

  describe('UpdatePensionRatesDto', () => {
    it('accepts valid rates meeting statutory minimums (0.08 and 0.10)', async () => {
      const dto = plainToInstance(UpdatePensionRatesDto, {
        pensionEmployeeRateOverride: 0.08,
        pensionEmployerRateOverride: 0.1,
        pensionBasisOverride: 'BASIC,HOUSING,TRANSPORT',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('accepts custom rates higher than statutory minimums (0.12 and 0.15)', async () => {
      const dto = plainToInstance(UpdatePensionRatesDto, {
        pensionEmployeeRateOverride: 0.12,
        pensionEmployerRateOverride: 0.15,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects employee pension rate below statutory minimum of 8% (0.08)', async () => {
      const dto = plainToInstance(UpdatePensionRatesDto, {
        pensionEmployeeRateOverride: 0.05,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const employeeRateError = errors.find(
        (e) => e.property === 'pensionEmployeeRateOverride',
      );
      expect(employeeRateError).toBeDefined();
      expect(employeeRateError?.constraints?.min).toBe(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    });

    it('rejects employer pension rate below statutory minimum of 10% (0.10)', async () => {
      const dto = plainToInstance(UpdatePensionRatesDto, {
        pensionEmployerRateOverride: 0.08,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const employerRateError = errors.find(
        (e) => e.property === 'pensionEmployerRateOverride',
      );
      expect(employerRateError).toBeDefined();
      expect(employerRateError?.constraints?.min).toBe(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    });

    it('allows null overrides to reset back to default statutory rates', async () => {
      const dto = plainToInstance(UpdatePensionRatesDto, {
        pensionEmployeeRateOverride: null,
        pensionEmployerRateOverride: null,
        pensionBasisOverride: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdatePensionConfigDto', () => {
    it('accepts updating penCentral code with pension rates', async () => {
      const dto = plainToInstance(UpdatePensionConfigDto, {
        penCentralEmployerCode: 'PR0000126311',
        pensionEmployeeRateOverride: 0.08,
        pensionEmployerRateOverride: 0.1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects pension rates below statutory minimums', async () => {
      const dto = plainToInstance(UpdatePensionConfigDto, {
        pensionEmployeeRateOverride: 0.03,
        pensionEmployerRateOverride: 0.05,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(2);
      const minMessage =
        errors[0].constraints?.min || errors[1].constraints?.min;
      expect(minMessage).toContain('statutory minimum');
    });
  });
});
