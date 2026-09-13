import { validate } from 'class-validator';
import { UpdateCompanyDto } from './update-company.dto';
import { AddEmployeeDto } from './add-employee.dto';
import { ImportEmployeesDto } from './import-employees.dto';

describe('Onboarding DTOs', () => {
  describe('UpdateCompanyDto', () => {
    it('should pass with valid company details', async () => {
      const dto = new UpdateCompanyDto();
      dto.companyName = 'StackHR Ltd';
      dto.industry = 'Software';
      dto.companySize = '11-50';
      dto.currency = 'NGN';
      dto.payrollFrequency = 'MONTHLY';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid currency choice', async () => {
      const dto = new UpdateCompanyDto();
      dto.companyName = 'StackHR Ltd';
      dto.industry = 'Software';
      dto.companySize = '11-50';
      dto.currency = 'INVALID';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('currency');
    });
  });

  describe('AddEmployeeDto', () => {
    it('should pass with valid employee details', async () => {
      const dto = new AddEmployeeDto();
      dto.fullName = 'Jane Doe';
      dto.email = 'jane@example.com';
      dto.department = 'Engineering';
      dto.jobTitle = 'Senior Developer';
      dto.employmentType = 'FULL_TIME';
      dto.salary = 500000;
      dto.startDate = '2026-01-01';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with zero or negative salary', async () => {
      const dto = new AddEmployeeDto();
      dto.fullName = 'Jane Doe';
      dto.email = 'jane@example.com';
      dto.department = 'Engineering';
      dto.jobTitle = 'Senior Developer';
      dto.employmentType = 'FULL_TIME';
      dto.salary = 0;
      dto.startDate = '2026-01-01';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('salary');
    });
  });

  describe('ImportEmployeesDto', () => {
    it('should pass with valid csv string', async () => {
      const dto = new ImportEmployeesDto();
      dto.csv = 'fullName,email\nJohn,john@example.com';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty csv string', async () => {
      const dto = new ImportEmployeesDto();
      dto.csv = '';

      const errors = await validate(dto);
      expect(errors.length).toBe(1);
      expect(errors[0].property).toBe('csv');
    });
  });
});
