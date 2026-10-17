import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { AttachEmployerDto, ValidateEmployerCodeDto } from './pension.dto';

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
});
